import * as THREE from 'three';
import { acceleratedRaycast, MeshBVH, ExtendedTriangle } from 'three-mesh-bvh';
import { loadBinaryParts } from './binary-parts.js';

const _bounds = new THREE.Box3();
const _segment = new THREE.Line3();
const _trianglePoint = new THREE.Vector3();
const _capsulePoint = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _originalCenter = new THREE.Vector3();
const _resolvedCenter = new THREE.Vector3();
const _segmentCenter = new THREE.Vector3();
const _candTri = new ExtendedTriangle();   // (closestPointToSegment is three-mesh-bvh's)

function typedArray(buffer, descriptor) {
  const constructors = { Float32Array, Uint16Array, Uint32Array, Int32Array };
  const Constructor = constructors[descriptor.type];
  if (!Constructor) throw new Error(`unsupported collision array type ${descriptor.type}`);
  return new Constructor(buffer, descriptor.byteOffset, descriptor.count);
}

function sliceBuffer(buffer, descriptor) {
  return buffer.slice(descriptor.byteOffset, descriptor.byteOffset + descriptor.byteLength);
}

export function deserializeCollisionWorld(metadata, binary) {
  if (metadata?.format !== 'hijacked-collision-bvh-v1') {
    throw new Error(`unsupported collision format ${metadata?.format ?? 'unknown'}`);
  }
  const positions = typedArray(binary, metadata.layout.position);
  const index = typedArray(binary, metadata.layout.index);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  if (metadata.bounds) {
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(...metadata.bounds.min),
      new THREE.Vector3(...metadata.bounds.max),
    );
  } else {
    geometry.computeBoundingBox();
  }
  geometry.boundsTree = MeshBVH.deserialize({
    version: 1,
    roots: metadata.layout.roots.map((root) => sliceBuffer(binary, root)),
    index,
    indirectBuffer: null,
  }, geometry, { setIndex: false });
  return new CollisionWorld(geometry, metadata);
}

export async function loadCollisionWorld({
  metadataUrl = 'hijacked_collision_bvh.json',
  onProgress = null,
} = {}) {
  const started = performance.now();
  const metadataResponse = await fetch(metadataUrl);
  if (!metadataResponse.ok) throw new Error(`collision metadata HTTP ${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  const parts = metadata.binaryParts ?? [{ uri: metadata.binary, byteLength: metadata.byteLength }];
  const binary = await loadBinaryParts(parts, { baseUrl: metadataResponse.url, byteLength: metadata.byteLength, onProgress });
  const world = deserializeCollisionWorld(metadata, binary);
  world.loadMilliseconds = performance.now() - started;
  return world;
}

export class CollisionWorld {
  constructor(geometry, metadata = {}) {
    if (!geometry?.attributes?.position) throw new TypeError('CollisionWorld requires position geometry');
    if (!geometry.boundsTree) geometry.boundsTree = new MeshBVH(geometry, { targetLeafSize: 12 });
    this.geometry = geometry;
    this.bvh = geometry.boundsTree;
    this.metadata = metadata;
    this.loadMilliseconds = 0;
    this._hitTriangle = new THREE.Triangle();
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      wireframe: true,
      transparent: true,
      opacity: 0.24,
      depthTest: false,
    }));
    this.mesh.name = 'collision_bvh_debug';
    this.mesh.visible = false;
    this.mesh.renderOrder = 40;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.raycast = acceleratedRaycast;
  }

  get stats() {
    return {
      format: this.metadata.format ?? 'runtime-bvh',
      vertices: this.geometry.attributes.position.count,
      triangles: this.geometry.index ? this.geometry.index.count / 3 : this.geometry.attributes.position.count / 3,
      bytes: this.metadata.byteLength ?? 0,
      loadMilliseconds: Math.round(this.loadMilliseconds),
    };
  }

  setDebugVisible(visible) {
    this.mesh.visible = Boolean(visible);
  }

  // Candidate cache (2026-10-17): the player's physics tests the capsule 4-8 times a step (the move, up to five overlap
  // iterations, step tries), and each test walked the whole BVH (Der Eisendrache: 6.5M triangles, ~11% of a frame on the
  // GTX 1660 Ti host). The triangles within a padded box around the capsule are gathered once (one walk) and reused
  // while the capsule stays inside the box; each has its bounds for a cheap reject. Only indexed geometry (every map).
  _gather(bounds, radius) {
    const c = this._cand ??= { box: new THREE.Box3(), count: 0, idx: new Int32Array(1024), tb: new Float32Array(1024 * 6) };
    const pad = Math.max(radius * 2.5, 36);
    c.box.copy(bounds); c.box.min.addScalar(-pad); c.box.max.addScalar(pad); c.count = 0;
    const box = c.box;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(box),
      intersectsTriangle: (t, i) => {
        if (c.count === c.idx.length) { const idx = new Int32Array(c.idx.length * 2); idx.set(c.idx); c.idx = idx; const tb = new Float32Array(idx.length * 6); tb.set(c.tb); c.tb = tb; }
        const k = c.count++, o = k * 6, a = t.a, b = t.b, cc = t.c;
        c.idx[k] = i;
        c.tb[o] = Math.min(a.x, b.x, cc.x); c.tb[o + 1] = Math.min(a.y, b.y, cc.y); c.tb[o + 2] = Math.min(a.z, b.z, cc.z);
        c.tb[o + 3] = Math.max(a.x, b.x, cc.x); c.tb[o + 4] = Math.max(a.y, b.y, cc.y); c.tb[o + 5] = Math.max(a.z, b.z, cc.z);
        return false;
      },
    });
    return c;
  }
  invalidateCache() { if (this._cand) this._cand.box.makeEmpty(); }

  capsuleIntersect(capsule) {
    _segment.start.copy(capsule.start);
    _segment.end.copy(capsule.end);
    _originalCenter.addVectors(capsule.start, capsule.end).multiplyScalar(0.5);
    _bounds.makeEmpty();
    _bounds.expandByPoint(capsule.start);
    _bounds.expandByPoint(capsule.end);
    _bounds.min.addScalar(-capsule.radius);
    _bounds.max.addScalar(capsule.radius);
    let hit = false;
    const test = (triangle) => {
      const distance = triangle.closestPointToSegment(_segment, _trianglePoint, _capsulePoint);
      if (distance >= capsule.radius) return false;
      const depth = capsule.radius - distance;
      _normal.subVectors(_capsulePoint, _trianglePoint);
      if (_normal.lengthSq() < 1e-12) {
        triangle.getNormal(_normal);
        _segmentCenter.addVectors(_segment.start, _segment.end).multiplyScalar(0.5);
        if (_normal.dot(_segmentCenter.sub(triangle.a)) < 0) _normal.negate();
      } else {
        _normal.multiplyScalar(1 / Math.max(distance, 1e-12));
      }
      _segment.start.addScaledVector(_normal, depth);
      _segment.end.addScaledVector(_normal, depth);
      hit = true;
      return false;
    };
    const index = this.geometry.index;
    if (this.useCache !== false && index && this.geometry.attributes.position.array) {   // useCache = false: the plain BVH walk (tests, A/B)
      const c = this._cand?.box.containsBox(_bounds) ? this._cand : this._gather(_bounds, capsule.radius);
      const pos = this.geometry.attributes.position.array, ia = index.array, tb = c.tb, tri = _candTri;
      const minX = _bounds.min.x, minY = _bounds.min.y, minZ = _bounds.min.z, maxX = _bounds.max.x, maxY = _bounds.max.y, maxZ = _bounds.max.z;
      for (let k = 0, n = c.count; k < n; k++) {
        const o = k * 6;
        if (tb[o] > maxX || tb[o + 3] < minX || tb[o + 1] > maxY || tb[o + 4] < minY || tb[o + 2] > maxZ || tb[o + 5] < minZ) continue;
        const t = c.idx[k] * 3, a = ia[t] * 3, b = ia[t + 1] * 3, cc = ia[t + 2] * 3;
        tri.a.set(pos[a], pos[a + 1], pos[a + 2]); tri.b.set(pos[b], pos[b + 1], pos[b + 2]); tri.c.set(pos[cc], pos[cc + 1], pos[cc + 2]);
        tri.needsUpdate = true;   // ExtendedTriangle caches its plane and edge data: refresh it for these vertices (stale data gave NaN contacts)
        test(tri);
      }
    } else this.bvh.shapecast({ intersectsBounds: (box) => box.intersectsBox(_bounds), intersectsTriangle: test });

    if (!hit) return false;
    _resolvedCenter.addVectors(_segment.start, _segment.end).multiplyScalar(0.5);
    _normal.subVectors(_resolvedCenter, _originalCenter);
    const depth = _normal.length();
    return depth > 0 ? { normal: _normal.multiplyScalar(1 / depth).clone(), depth } : false;
  }

  raycastFirst(ray, near = 0, far = Infinity, side = THREE.DoubleSide) {
    return this.bvh.raycastFirst(ray, side, near, far);
  }

  rayIntersect(ray, near = 0, far = Infinity) {
    const hit = this.raycastFirst(ray, near, far);
    if (!hit) return false;
    const index = this.geometry.index;
    const position = this.geometry.attributes.position;
    const triangleOffset = hit.faceIndex * 3;
    const a = index ? index.getX(triangleOffset) : triangleOffset;
    const b = index ? index.getX(triangleOffset + 1) : triangleOffset + 1;
    const c = index ? index.getX(triangleOffset + 2) : triangleOffset + 2;
    this._hitTriangle.a.fromBufferAttribute(position, a);
    this._hitTriangle.b.fromBufferAttribute(position, b);
    this._hitTriangle.c.fromBufferAttribute(position, c);
    // Collision queries are double-sided. Report the contacted side to floor
    // probes too; some return-room floor meshes have downward source winding.
    this._hitTriangle.getNormal(_normal);
    if (_normal.dot(ray.direction) > 0) {
      _trianglePoint.copy(this._hitTriangle.b);
      this._hitTriangle.b.copy(this._hitTriangle.c);
      this._hitTriangle.c.copy(_trianglePoint);
    }
    return {
      distance: hit.distance,
      position: hit.point.clone(),
      point: hit.point.clone(),
      faceIndex: hit.faceIndex,
      triangle: this._hitTriangle,
    };
  }
}

export default CollisionWorld;
