#!/usr/bin/env node
"use strict";

/* Built-ins-only streaming builder for NeuroScope's .nsovl binary format. */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const { TextDecoder } = require("util");

const MAGIC = Buffer.from("NSOVLIDX", "ascii");
const VERSION = 2;
const HEADER_SIZE = 4096;
const SEGMENT_BYTES = 16;
const CELL_SIZE_DEFAULT = 256;
const MAX_FEATURE_CHARS = 128 * 1024 * 1024;
const MAX_GRID_CELLS = 10_000_000;
const MAX_GRID_ENTRIES = 100_000_000;
const MAX_GRID_AMPLIFICATION = 32;
const MAX_CELLS_PER_SEGMENT = 4096;
const IO_BYTES = 8 * 1024 * 1024;
const SEGMENT_BUFFER_RECORDS = 262_144;

function fail(message) {
  throw new Error(message);
}

class SourceValidationError extends Error {}

function invalid(message) {
  throw new SourceValidationError(message);
}

function alignWriter(writer, alignment = 64) {
  const padding = (alignment - (writer.position % alignment)) % alignment;
  if (padding) writer.write(Buffer.alloc(padding));
}

class BufferedFileWriter {
  constructor(fd, position = 0) {
    this.fd = fd;
    this.position = position;
  }

  write(buffer) {
    let offset = 0;
    while (offset < buffer.length) {
      const written = fs.writeSync(this.fd, buffer, offset, buffer.length - offset, null);
      if (!written) fail("Could not make progress while writing the overlay index.");
      offset += written;
      this.position += written;
    }
  }
}

class SegmentWriter {
  constructor(writer) {
    this.writer = writer;
    this.buffer = Buffer.allocUnsafe(SEGMENT_BYTES * SEGMENT_BUFFER_RECORDS);
    this.offset = 0;
  }

  write(x1, y1, x2, y2) {
    if (this.offset + SEGMENT_BYTES > this.buffer.length) this.flush();
    this.buffer.writeFloatLE(x1, this.offset);
    this.buffer.writeFloatLE(y1, this.offset + 4);
    this.buffer.writeFloatLE(x2, this.offset + 8);
    this.buffer.writeFloatLE(y2, this.offset + 12);
    this.offset += SEGMENT_BYTES;
  }

  flush() {
    if (!this.offset) return;
    this.writer.write(this.buffer.subarray(0, this.offset));
    this.offset = 0;
  }
}

class PrimitiveMapWriter {
  constructor(path) {
    this.path = `${path}.primitive.tmp`;
    this.fd = null;
    this.count = 0;
    this.buffer = Buffer.allocUnsafe(4 * SEGMENT_BUFFER_RECORDS);
    this.offset = 0;
  }

  get implicit() {
    return this.fd === null;
  }

  append(segmentId, primitiveId) {
    if (segmentId !== this.count) fail("Primitive map segment ids are not contiguous.");
    if (this.fd === null && primitiveId === segmentId) {
      this.count += 1;
      return;
    }
    if (this.fd === null) {
      this.fd = fs.openSync(this.path, "w+");
      const backfill = Buffer.allocUnsafe(4 * SEGMENT_BUFFER_RECORDS);
      for (let start = 0; start < this.count; start += SEGMENT_BUFFER_RECORDS) {
        const stop = Math.min(this.count, start + SEGMENT_BUFFER_RECORDS);
        for (let value = start; value < stop; value += 1) {
          backfill.writeUInt32LE(value, (value - start) * 4);
        }
        fs.writeSync(this.fd, backfill, 0, (stop - start) * 4, null);
      }
    }
    if (this.offset + 4 > this.buffer.length) this.flush();
    this.buffer.writeUInt32LE(primitiveId, this.offset);
    this.offset += 4;
    this.count += 1;
  }

  flush() {
    if (this.fd === null || !this.offset) return;
    fs.writeSync(this.fd, this.buffer, 0, this.offset, null);
    this.offset = 0;
  }

  copyTo(writer) {
    if (this.fd === null) return 0;
    this.flush();
    const size = fs.fstatSync(this.fd).size;
    const buffer = Buffer.allocUnsafe(IO_BYTES);
    let position = 0;
    while (position < size) {
      const length = fs.readSync(this.fd, buffer, 0, Math.min(buffer.length, size - position), position);
      if (!length) fail("Primitive map is truncated.");
      writer.write(buffer.subarray(0, length));
      position += length;
    }
    return size;
  }

  close() {
    if (this.fd !== null) {
      this.flush();
      fs.closeSync(this.fd);
      this.fd = null;
      try { fs.unlinkSync(this.path); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
}

class FeatureCollectionSplitter {
  constructor(onFeature) {
    this.onFeature = onFeature;
    this.mode = "prefix";
    this.prefix = "";
    this.suffix = "";
    this.stack = [];
    this.inString = false;
    this.escape = false;
    this.stringToken = "";
    this.expectRootKey = false;
    this.pendingRootKey = null;
    this.awaitFeaturesArray = false;
    this.featureState = "first";
    this.featureParts = null;
    this.featureDepth = 0;
    this.featureInString = false;
    this.featureEscape = false;
    this.featureCount = 0;
  }

  feed(text) {
    let index = 0;
    while (index < text.length) {
      if (this.mode === "prefix") {
        index = this.consumePrefix(text, index);
      } else if (this.mode === "features") {
        index = this.consumeFeatures(text, index);
      } else {
        this.suffix += text.slice(index);
        if (this.suffix.length > 1024 * 1024) invalid("Unexpectedly large content follows the features array.");
        return;
      }
    }
  }

  consumePrefix(text, index) {
    const character = text[index];
    this.prefix += character;
    if (this.prefix.length > 1024 * 1024) invalid("GeoJSON features array was not found in the first MiB.");
    if (this.inString) {
      this.stringToken += character;
      if (this.escape) this.escape = false;
      else if (character === "\\") this.escape = true;
      else if (character === '"') {
        this.inString = false;
        if (this.stack.length === 1 && this.stack[0] === "object" && this.expectRootKey) {
          this.pendingRootKey = JSON.parse(this.stringToken);
          this.expectRootKey = false;
        }
      }
      return index + 1;
    }
    if (/\s/.test(character)) return index + 1;
    if (this.awaitFeaturesArray) {
      if (character !== "[") invalid("Top-level GeoJSON features value must be an array.");
      this.awaitFeaturesArray = false;
      this.mode = "features";
      return index + 1;
    }
    if (character === '"') {
      this.inString = true;
      this.escape = false;
      this.stringToken = '"';
    } else if (character === "{") {
      this.stack.push("object");
      if (this.stack.length === 1) this.expectRootKey = true;
    } else if (character === "[") {
      this.stack.push("array");
    } else if (character === "}" || character === "]") {
      const expected = character === "}" ? "object" : "array";
      if (this.stack.pop() !== expected) invalid("Mismatched JSON container before the features array.");
    } else if (character === ":" && this.stack.length === 1 && this.pendingRootKey !== null) {
      if (this.pendingRootKey === "features") this.awaitFeaturesArray = true;
      this.pendingRootKey = null;
    } else if (character === "," && this.stack.length === 1 && this.stack[0] === "object") {
      this.expectRootKey = true;
      this.pendingRootKey = null;
    }
    return index + 1;
  }

  consumeFeatures(text, index) {
    if (this.featureParts !== null) return this.consumeFeatureObject(text, index);
    const character = text[index];
    if (/\s/.test(character)) return index + 1;
    if (this.featureState === "first" || this.featureState === "element") {
      if (character === "]") {
        if (this.featureState === "element") invalid("Trailing comma in GeoJSON features array.");
        this.suffix = "]";
        this.mode = "suffix";
        return index + 1;
      }
      if (character !== "{") invalid("Every GeoJSON FeatureCollection entry must be an object.");
      this.featureParts = [];
      this.featureDepth = 0;
      this.featureInString = false;
      this.featureEscape = false;
      return this.consumeFeatureObject(text, index);
    }
    if (character === ",") {
      this.featureState = "element";
      return index + 1;
    }
    if (character === "]") {
      this.suffix = "]";
      this.mode = "suffix";
      return index + 1;
    }
    invalid("Expected a comma or closing bracket after a GeoJSON feature.");
  }

  consumeFeatureObject(text, start) {
    let index = start;
    const sliceStart = start;
    for (; index < text.length; index += 1) {
      const character = text[index];
      if (this.featureInString) {
        if (this.featureEscape) this.featureEscape = false;
        else if (character === "\\") this.featureEscape = true;
        else if (character === '"') this.featureInString = false;
        continue;
      }
      if (character === '"') {
        this.featureInString = true;
      } else if (character === "{" || character === "[") {
        this.featureDepth += 1;
      } else if (character === "}" || character === "]") {
        this.featureDepth -= 1;
        if (this.featureDepth < 0) invalid("Mismatched JSON container inside a feature.");
        if (this.featureDepth === 0) {
          this.featureParts.push(text.slice(sliceStart, index + 1));
          const raw = this.featureParts.join("");
          if (raw.length > MAX_FEATURE_CHARS) invalid("A single GeoJSON feature exceeds the streaming limit.");
          let feature;
          try { feature = JSON.parse(raw); } catch (error) { invalid(`Invalid GeoJSON feature: ${error.message}`); }
          this.onFeature(feature, this.featureCount);
          this.featureCount += 1;
          this.featureParts = null;
          this.featureState = "after";
          return index + 1;
        }
      }
    }
    this.featureParts.push(text.slice(sliceStart));
    const buffered = this.featureParts.reduce((total, part) => total + part.length, 0);
    if (buffered > MAX_FEATURE_CHARS) invalid("A single GeoJSON feature exceeds the streaming limit.");
    return index;
  }

  finish() {
    if (this.featureParts !== null || this.featureInString) invalid("GeoJSON ended inside a feature object.");
    if (this.mode !== "suffix") invalid("GeoJSON ended before the features array was closed.");
    let skeleton;
    try { skeleton = JSON.parse(this.prefix + this.suffix); } catch (error) {
      invalid(`Invalid top-level GeoJSON: ${error.message}`);
    }
    if (!skeleton || skeleton.type !== "FeatureCollection" || !Array.isArray(skeleton.features)) {
      invalid("Large overlay indexes require a GeoJSON FeatureCollection.");
    }
    if (skeleton.features.length !== 0) invalid("GeoJSON contains duplicate or malformed features members.");
    if (!this.featureCount) invalid("GeoJSON contains no features.");
  }
}

function statIdentity(path) {
  const value = fs.statSync(path, { bigint: true });
  return {
    size: value.size,
    mtime_ns: value.mtimeNs,
    inode: value.ino,
    device: value.dev,
  };
}

function sameStat(first, second) {
  return first.size === second.size && first.mtime_ns === second.mtime_ns
    && first.inode === second.inode && first.device === second.device;
}

function jsonStat(value, sha256) {
  return {
    size: Number(value.size),
    mtime_ns: value.mtime_ns.toString(),
    inode: value.inode.toString(),
    device: value.device.toString(),
    sha256,
  };
}

function boundsObject(values) {
  return { min_x: values[0], min_y: values[1], max_x: values[2], max_y: values[3] };
}

function extend(values, x, y) {
  if (x < values[0]) values[0] = x;
  if (y < values[1]) values[1] = y;
  if (x > values[2]) values[2] = x;
  if (y > values[3]) values[3] = y;
}

function checkedPosition(value, featureIndex, primitiveIndex, positionIndex) {
  if (!Array.isArray(value) || value.length < 2
      || typeof value[0] !== "number" || typeof value[1] !== "number"
      || !Number.isFinite(value[0]) || !Number.isFinite(value[1])) {
    invalid(`Feature ${featureIndex}, line ${primitiveIndex}, position ${positionIndex} must contain finite numeric X/Y.`);
  }
  return value;
}

function validateMetadata(value, featureIndex) {
  const stack = [[value, 0]];
  let visited = 0;
  while (stack.length) {
    const [current, depth] = stack.pop();
    if (depth > 100) invalid(`Feature ${featureIndex} metadata is too deeply nested.`);
    if (!current || typeof current !== "object") continue;
    visited += 1;
    if (visited > 1_000_000) invalid(`Feature ${featureIndex} metadata is too large.`);
    const children = Array.isArray(current) ? current : Object.values(current);
    for (const child of children) stack.push([child, depth + 1]);
  }
}

function segmentExtent(x1, y1, x2, y2, cellSize) {
  const minCol = Math.floor(Math.min(x1, x2) / cellSize);
  const maxCol = Math.floor(Math.max(x1, x2) / cellSize);
  const minRow = Math.floor(Math.min(y1, y2) / cellSize);
  const maxRow = Math.floor(Math.max(y1, y2) / cellSize);
  return [minCol, maxCol, minRow, maxRow, (maxCol - minCol + 1) * (maxRow - minRow + 1)];
}

function scanSegmentTable(fd, segmentCount, callback) {
  const buffer = Buffer.allocUnsafe(SEGMENT_BYTES * SEGMENT_BUFFER_RECORDS);
  let segmentId = 0;
  while (segmentId < segmentCount) {
    const records = Math.min(SEGMENT_BUFFER_RECORDS, segmentCount - segmentId);
    const byteLength = records * SEGMENT_BYTES;
    const received = fs.readSync(fd, buffer, 0, byteLength, HEADER_SIZE + segmentId * SEGMENT_BYTES);
    if (received !== byteLength) fail("Temporary segment table is truncated.");
    const values = new Float32Array(buffer.buffer, buffer.byteOffset, byteLength / 4);
    for (let offset = 0; offset < records; offset += 1) {
      const valueOffset = offset * 4;
      callback(segmentId + offset, values[valueOffset], values[valueOffset + 1], values[valueOffset + 2], values[valueOffset + 3]);
    }
    segmentId += records;
  }
}

function writeUint64Array(writer, values) {
  const buffer = Buffer.allocUnsafe(Math.min(IO_BYTES, Math.max(8, values.length * 8)));
  let index = 0;
  while (index < values.length) {
    const count = Math.min(Math.floor(buffer.length / 8), values.length - index);
    for (let offset = 0; offset < count; offset += 1) {
      buffer.writeBigUInt64LE(BigInt(values[index + offset]), offset * 8);
    }
    writer.write(buffer.subarray(0, count * 8));
    index += count;
  }
}

function build(source, output, cellSize) {
  if (os.endianness() !== "LE") fail("The fast index builder currently requires a little-endian host.");
  if (!Number.isFinite(cellSize) || cellSize <= 0) invalid("cell_size must be a positive finite number.");
  const before = statIdentity(source);
  const fd = fs.openSync(output, "w+");
  const writer = new BufferedFileWriter(fd, 0);
  const primitiveMap = new PrimitiveMapWriter(output);
  let completed = false;
  try {
    writer.write(Buffer.alloc(HEADER_SIZE));
    const segmentWriter = new SegmentWriter(writer);
    const hash = crypto.createHash("sha256");
    const features = [];
    const exactBounds = [Infinity, Infinity, -Infinity, -Infinity];
    const storedBounds = [Infinity, Infinity, -Infinity, -Infinity];
    let featureCount = 0;
    let primitiveCount = 0;
    let segmentCount = 0;
    let vertexCount = 0;
    let degenerateCount = 0;
    let coordinatesExact = true;
    let maxCoordinateError = 0;

    const splitter = new FeatureCollectionSplitter((feature, featureIndex) => {
      if (!feature || feature.type !== "Feature") invalid(`Feature ${featureIndex} has type other than 'Feature'.`);
      const geometry = feature.geometry;
      if (!geometry || typeof geometry !== "object") invalid(`Feature ${featureIndex} is missing a geometry object.`);
      let primitives;
      if (geometry.type === "LineString") primitives = [geometry.coordinates];
      else if (geometry.type === "MultiLineString") primitives = geometry.coordinates;
      else invalid(`Feature ${featureIndex} geometry ${JSON.stringify(geometry.type)} is unsupported.`);
      if (!Array.isArray(primitives) || !primitives.length) invalid(`Feature ${featureIndex} contains no line primitives.`);
      const featureSegmentStart = segmentCount;
      const featurePrimitiveStart = primitiveCount;
      let featureVertexCount = 0;
      const featureBounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (let primitiveOffset = 0; primitiveOffset < primitives.length; primitiveOffset += 1) {
        const line = primitives[primitiveOffset];
        if (!Array.isArray(line) || line.length < 2) invalid(`Feature ${featureIndex}, line ${primitiveOffset} needs at least two positions.`);
        const primitiveId = primitiveCount;
        primitiveCount += 1;
        vertexCount += line.length;
        featureVertexCount += line.length;
        let previous = checkedPosition(line[0], featureIndex, primitiveOffset, 0);
        extend(exactBounds, previous[0], previous[1]);
        extend(featureBounds, previous[0], previous[1]);
        for (let positionIndex = 1; positionIndex < line.length; positionIndex += 1) {
          const current = checkedPosition(line[positionIndex], featureIndex, primitiveOffset, positionIndex);
          const x1 = previous[0]; const y1 = previous[1]; const x2 = current[0]; const y2 = current[1];
          extend(exactBounds, x2, y2);
          extend(featureBounds, x2, y2);
          const sx1 = Math.fround(x1); const sy1 = Math.fround(y1);
          const sx2 = Math.fround(x2); const sy2 = Math.fround(y2);
          if (![sx1, sy1, sx2, sy2].every(Number.isFinite)) invalid(`Feature ${featureIndex} has a coordinate outside Float32 range.`);
          extend(storedBounds, sx1, sy1);
          extend(storedBounds, sx2, sy2);
          const error = Math.max(Math.abs(x1 - sx1), Math.abs(y1 - sy1), Math.abs(x2 - sx2), Math.abs(y2 - sy2));
          if (error) coordinatesExact = false;
          if (error > maxCoordinateError) maxCoordinateError = error;
          if (x1 === x2 && y1 === y2) degenerateCount += 1;
          if (segmentCount > 0xffffffff || primitiveId > 0xffffffff) invalid("Overlay exceeds the uint32 identifier limit.");
          segmentWriter.write(sx1, sy1, sx2, sy2);
          primitiveMap.append(segmentCount, primitiveId);
          segmentCount += 1;
          previous = current;
        }
      }
      const attributes = {};
      for (const [key, value] of Object.entries(feature)) if (key !== "geometry") attributes[key] = value;
      validateMetadata(attributes, featureIndex);
      features.push({
        index: featureIndex,
        source_id: Object.prototype.hasOwnProperty.call(feature, "id") ? feature.id
          : Object.prototype.hasOwnProperty.call(feature, "ID") ? feature.ID : featureIndex,
        segment_start: featureSegmentStart,
        segment_count: segmentCount - featureSegmentStart,
        primitive_start: featurePrimitiveStart,
        primitive_count: primitiveCount - featurePrimitiveStart,
        vertex_count: featureVertexCount,
        bounds: boundsObject(featureBounds),
        attributes,
      });
      featureCount += 1;
    });

    const sourceFd = fs.openSync(source, "r");
    const input = Buffer.allocUnsafe(IO_BYTES);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      while (true) {
        const count = fs.readSync(sourceFd, input, 0, input.length, null);
        if (!count) break;
        const bytes = input.subarray(0, count);
        hash.update(bytes);
        splitter.feed(decoder.decode(bytes, { stream: true }));
      }
      splitter.feed(decoder.decode());
      splitter.finish();
    } catch (error) {
      if (error instanceof TypeError && /encoded data/.test(error.message)) invalid(`GeoJSON is not valid UTF-8: ${error.message}`);
      throw error;
    } finally {
      fs.closeSync(sourceFd);
    }
    segmentWriter.flush();
    primitiveMap.flush();
    if (!featureCount || !segmentCount) invalid("GeoJSON contains no indexable line segments.");
    const after = statIdentity(source);
    if (!sameStat(before, after)) fail("Overlay source changed while its index was being built.");
    const digest = hash.digest("hex");

    const gridMinCol = Math.floor(storedBounds[0] / cellSize);
    const gridMaxCol = Math.floor(storedBounds[2] / cellSize);
    const gridMinRow = Math.floor(storedBounds[1] / cellSize);
    const gridMaxRow = Math.floor(storedBounds[3] / cellSize);
    const gridCols = gridMaxCol - gridMinCol + 1;
    const gridRows = gridMaxRow - gridMinRow + 1;
    const gridCellCount = gridCols * gridRows;
    if (gridCellCount > MAX_GRID_CELLS) invalid(`Overlay bounds require ${gridCellCount} grid cells; increase cell_size.`);
    const counts = new Uint32Array(gridCellCount);
    const longIds = [];
    let gridEntryCount = 0;
    scanSegmentTable(fd, segmentCount, (segmentId, x1, y1, x2, y2) => {
      const [minCol, maxCol, minRow, maxRow, covered] = segmentExtent(x1, y1, x2, y2, cellSize);
      if (covered > MAX_CELLS_PER_SEGMENT) {
        longIds.push(segmentId);
        return;
      }
      for (let row = minRow; row <= maxRow; row += 1) {
        const rowOffset = (row - gridMinRow) * gridCols;
        for (let col = minCol; col <= maxCol; col += 1) {
          const cell = rowOffset + col - gridMinCol;
          if (counts[cell] === 0xffffffff) invalid("A grid cell exceeds the uint32 entry limit.");
          counts[cell] += 1;
          gridEntryCount += 1;
        }
      }
    });
    if (gridEntryCount > MAX_GRID_ENTRIES || gridEntryCount > segmentCount * MAX_GRID_AMPLIFICATION) {
      invalid(`Overlay grid would require ${gridEntryCount} entries for ${segmentCount} segments.`);
    }
    const offsets = new Float64Array(gridCellCount + 1);
    for (let index = 0; index < gridCellCount; index += 1) offsets[index + 1] = offsets[index] + counts[index];
    const cursor = offsets.slice(0, -1);
    const items = new Uint32Array(gridEntryCount);
    scanSegmentTable(fd, segmentCount, (segmentId, x1, y1, x2, y2) => {
      const [minCol, maxCol, minRow, maxRow, covered] = segmentExtent(x1, y1, x2, y2, cellSize);
      if (covered > MAX_CELLS_PER_SEGMENT) return;
      for (let row = minRow; row <= maxRow; row += 1) {
        const rowOffset = (row - gridMinRow) * gridCols;
        for (let col = minCol; col <= maxCol; col += 1) {
          const cell = rowOffset + col - gridMinCol;
          items[cursor[cell]] = segmentId;
          cursor[cell] += 1;
        }
      }
    });
    let occupiedCellCount = 0;
    for (let index = 0; index < counts.length; index += 1) if (counts[index]) occupiedCellCount += 1;
    const occupiedCells = new Uint32Array(occupiedCellCount);
    for (let index = 0, outputIndex = 0; index < counts.length; index += 1) {
      if (counts[index]) {
        occupiedCells[outputIndex] = index;
        outputIndex += 1;
      }
    }

    const sections = {
      segments: { offset: HEADER_SIZE, length: segmentCount * SEGMENT_BYTES, count: segmentCount, record_size: SEGMENT_BYTES },
    };
    alignWriter(writer);
    let sectionOffset = writer.position;
    writeUint64Array(writer, offsets);
    sections.grid_offsets = { offset: sectionOffset, length: offsets.length * 8, count: offsets.length, record_size: 8 };
    alignWriter(writer);
    sectionOffset = writer.position;
    writer.write(Buffer.from(items.buffer, items.byteOffset, items.byteLength));
    sections.grid_items = { offset: sectionOffset, length: items.byteLength, count: items.length, record_size: 4 };
    alignWriter(writer);
    sectionOffset = writer.position;
    writer.write(Buffer.from(occupiedCells.buffer, occupiedCells.byteOffset, occupiedCells.byteLength));
    sections.occupied_cells = {
      offset: sectionOffset, length: occupiedCells.byteLength,
      count: occupiedCells.length, record_size: 4,
    };
    alignWriter(writer);
    sectionOffset = writer.position;
    const longBuffer = Buffer.allocUnsafe(longIds.length * 4);
    for (let index = 0; index < longIds.length; index += 1) longBuffer.writeUInt32LE(longIds[index], index * 4);
    writer.write(longBuffer);
    sections.long_items = { offset: sectionOffset, length: longBuffer.length, count: longIds.length, record_size: 4 };
    alignWriter(writer);
    sectionOffset = writer.position;
    const primitiveBytes = primitiveMap.copyTo(writer);
    sections.primitive_ids = {
      offset: sectionOffset, length: primitiveBytes,
      count: primitiveMap.implicit ? 0 : segmentCount,
      record_size: primitiveMap.implicit ? 0 : 4,
    };
    alignWriter(writer);
    sectionOffset = writer.position;
    const featureBuffer = Buffer.from(JSON.stringify(features), "utf8");
    writer.write(featureBuffer);
    sections.features = { offset: sectionOffset, length: featureBuffer.length, count: featureCount, record_size: 0 };
    const fileSize = writer.position;
    const metadata = {
      version: VERSION,
      source: jsonStat(after, digest),
      feature_count: featureCount,
      primitive_count: primitiveCount,
      segment_count: segmentCount,
      vertex_count: vertexCount,
      degenerate_count: degenerateCount,
      bounds: boundsObject(exactBounds),
      stored_bounds: boundsObject(storedBounds),
      coordinate_encoding: "float32-le",
      coordinates_exact: coordinatesExact,
      max_coordinate_error: maxCoordinateError,
      cell_size: cellSize,
      grid_min_col: gridMinCol,
      grid_min_row: gridMinRow,
      grid_cols: gridCols,
      grid_rows: gridRows,
      grid_entry_count: gridEntryCount,
      occupied_cell_count: occupiedCellCount,
      long_segment_count: longIds.length,
      primitive_ids_implicit: primitiveMap.implicit,
      file_size: fileSize,
      sections,
    };
    const headerPayload = Buffer.from(JSON.stringify({ format: "NeuroScope overlay spatial index", metadata }), "utf8");
    if (headerPayload.length > HEADER_SIZE - 16) fail("Index header metadata exceeds its reserved space.");
    const prefix = Buffer.alloc(16);
    MAGIC.copy(prefix, 0);
    prefix.writeUInt32LE(VERSION, 8);
    prefix.writeUInt32LE(headerPayload.length, 12);
    fs.writeSync(fd, prefix, 0, prefix.length, 0);
    fs.writeSync(fd, headerPayload, 0, headerPayload.length, 16);
    fs.fsyncSync(fd);
    completed = true;
    process.stdout.write(`${JSON.stringify(metadata)}\n`);
  } finally {
    primitiveMap.close();
    fs.closeSync(fd);
    if (!completed) {
      try { fs.unlinkSync(output); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
}

function main() {
  if (process.argv.length !== 5) fail("Usage: overlay_index_fast.js SOURCE OUTPUT CELL_SIZE");
  build(process.argv[2], process.argv[3], Number(process.argv[4] || CELL_SIZE_DEFAULT));
}

try {
  main();
} catch (error) {
  if (error instanceof SourceValidationError) {
    process.stderr.write(`NSOVL_VALIDATION:${error.message}\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write(`NSOVL_INTERNAL:${error && error.code ? error.code : "failure"}\n`);
    process.exitCode = 1;
  }
}
