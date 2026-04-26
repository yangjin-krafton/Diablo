// Spherical world (Mario Galaxy style). All entities live as world-space Vector3
// points on the sphere surface with |pos| = radius. Movement, facing, and
// orientation all flow through this helper so gameplay code stays coordinate-agnostic.
//
// Conventions used by orient():
//   - local +y (mesh up)       = radial outward from planet center
//   - local +z (mesh forward)  = tangent "forward" direction
//   - if a model's default facing is not +z, set a yawOffset (radians).
//
// Key operations:
//   moveAlong(pos, tangent, distance)   — great-circle translate pos by distance.
//   tangentTo(pos, target)              — unit tangent at pos pointing toward target.
//   projectToTangent(pos, vec)          — strip radial component from vec, normalize.
//   arcDistance(a, b)                   — surface distance between two surface points.
//   orient(mesh, pos, forward, yaw)     — set mesh transform to stand on surface.
//   randomPointAtArc(center, arcDist)   — random point on surface arcDist away.

import * as THREE from 'three';

export class SphereSurface {
    constructor(radius) {
        this.radius = radius;
    }

    /** Snap a position vector onto the sphere surface. */
    snapToSurface(pos) {
        return pos.setLength(this.radius);
    }

    /** Project an arbitrary world vector onto the tangent plane at pos and normalize.
     *  Returns a unit tangent vector (or zero if input is parallel to radius).
     */
    projectToTangent(pos, vec, out = new THREE.Vector3()) {
        const up = _v1.copy(pos).normalize();
        out.copy(vec).addScaledVector(up, -vec.dot(up));
        const len = out.length();
        if (len > 1e-6) out.divideScalar(len);
        else out.set(0, 0, 0);
        return out;
    }

    /** Great-circle move: translate pos along tangent direction by linear distance. */
    moveAlong(pos, tangent, distance) {
        if (distance === 0 || tangent.lengthSq() < 1e-10) return pos;
        const axis = _v1.crossVectors(pos, tangent);
        if (axis.lengthSq() < 1e-10) return pos;
        axis.normalize();
        const angle = distance / this.radius;
        pos.applyAxisAngle(axis, angle);
        pos.setLength(this.radius);
        return pos;
    }

    /** Unit tangent at pos pointing toward target (on or off surface). */
    tangentTo(pos, target, out = new THREE.Vector3()) {
        out.subVectors(target, pos);
        return this.projectToTangent(pos, out, out);
    }

    /** Surface arc distance between two points (projected to surface). */
    arcDistance(a, b) {
        const la = a.length(), lb = b.length();
        if (la < 1e-6 || lb < 1e-6) return 0;
        const d = a.dot(b) / (la * lb);
        return Math.acos(Math.max(-1, Math.min(1, d))) * this.radius;
    }

    /** Orient mesh to stand on sphere surface at pos, facing the given tangent forward.
     *  yawOffset rotates around local +y (the radial up) if the model's default face
     *  direction is not +z.
     */
    orient(mesh, pos, forward, yawOffset = 0) {
        mesh.position.copy(pos);

        const up = _v1.copy(pos).normalize();
        // re-tangent forward against up (numeric drift safety)
        const f = _v2.copy(forward).addScaledVector(up, -forward.dot(up));
        if (f.lengthSq() < 1e-8) {
            // fallback: derive any tangent
            f.set(1, 0, 0).addScaledVector(up, -up.x);
            if (f.lengthSq() < 1e-8) f.set(0, 0, 1).addScaledVector(up, -up.z);
        }
        f.normalize();

        const right = _v3.crossVectors(up, f).normalize();
        // re-orthogonalize forward
        const fwd = _v4.crossVectors(right, up).normalize();

        _m.makeBasis(right, up, fwd);
        mesh.quaternion.setFromRotationMatrix(_m);
        if (yawOffset !== 0) mesh.rotateY(yawOffset);
    }

    /** Uniformly random point on the sphere surface (independent of any
     *  anchor). Useful for placement systems that need to spread entities
     *  across the full planet rather than within a ring around a center. */
    randomPointOnSphere(out = new THREE.Vector3()) {
        // cos(theta) uniform in [-1, 1], phi uniform in [0, 2π) → uniform
        // distribution over the unit sphere (Marsaglia / archimedes hat-box).
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        out.set(s * Math.cos(phi), u, s * Math.sin(phi));
        out.multiplyScalar(this.radius);
        return out;
    }

    /** Random point on surface at given arc distance from center. */
    randomPointAtArc(center, arcDist, out = new THREE.Vector3()) {
        const up = _v1.copy(center).normalize();
        // random world direction not parallel to up
        const r = _v2;
        do {
            r.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        } while (r.lengthSq() < 0.01);
        r.addScaledVector(up, -r.dot(up));
        if (r.lengthSq() < 1e-6) r.set(1, 0, 0).addScaledVector(up, -up.x);
        r.normalize();

        out.copy(center);
        this.moveAlong(out, r, arcDist);
        return out;
    }

    /** Point on surface at `arcDist` from `center`, in tangent direction
     *  rotated `bearing` radians around the radial axis at `center`.
     *  Bearing 0 corresponds to the same baseline tangent every time, so
     *  callers can deterministically spread points across angles
     *  (e.g. divide a circle into N equal sectors). */
    pointAtArcAndBearing(center, arcDist, bearing, out = new THREE.Vector3()) {
        const up = _v1.copy(center).normalize();
        // Stable baseline tangent: project world +Y onto tangent plane,
        // fall back to +X if the up axis itself is +Y/-Y.
        const r = _v2.set(0, 1, 0).addScaledVector(up, -up.y);
        if (r.lengthSq() < 1e-4) r.set(1, 0, 0).addScaledVector(up, -up.x);
        r.normalize();
        // Rotate baseline tangent around the radial up by `bearing`.
        const ax = up.x, ay = up.y, az = up.z;
        const c = Math.cos(bearing);
        const s = Math.sin(bearing);
        const rx = r.x, ry = r.y, rz = r.z;
        // Rodrigues' rotation around `up`
        const dot = ax * rx + ay * ry + az * rz;
        const cx = ay * rz - az * ry;
        const cy = az * rx - ax * rz;
        const cz = ax * ry - ay * rx;
        r.set(
            rx * c + cx * s + ax * dot * (1 - c),
            ry * c + cy * s + ay * dot * (1 - c),
            rz * c + cz * s + az * dot * (1 - c),
        );
        const len = r.length();
        if (len > 1e-6) r.divideScalar(len);

        out.copy(center);
        this.moveAlong(out, r, arcDist);
        return out;
    }
}

// module-scoped scratch vectors (each method uses them internally without calling
// another method that also uses them)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m = new THREE.Matrix4();
