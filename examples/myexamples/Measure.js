import * as THREE from '../../build/three.module.js';
import { CSS2DObject } from '../jsm/renderers/CSS2DRenderer.js';
export var MeasureMode;
(function (MeasureMode) {
    MeasureMode["Distance"] = "Distance";
    MeasureMode["Area"] = "Area";
    MeasureMode["Angle"] = "Angle";
})(MeasureMode || (MeasureMode = {}));
const pointTexture = new THREE.TextureLoader().load('./circle.png');
/**
 * Measure class
 */
export default class Measure {
    constructor(renderer, css2dRenderer, scene, camera, mode = MeasureMode.Distance) {
        // lineWidth is ignored for Chrome on Windows, which is a known issue:
        // https://github.com/mrdoob/three.js/issues/269
        // line color: 0x87cefa, point color: 0x74e0d0
        this.LINE_MATERIAL = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3, opacity: 0.8, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
        this.POINT_MATERIAL = new THREE.PointsMaterial({ color: 0xff5000, map: pointTexture, size: 10, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false });
        this.MESH_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x87cefa, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
        this.MOUSE_MATERIAL = new THREE.PointsMaterial({ color: 0xffff00, map: pointTexture, size: 10, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false });
        this.MAX_POINTS = 100; // TODO: better to remove this limitation
        this.MAX_DISTANCE = 500; // when intersected object's distance is too far away, then ignore it
        this.OBJ_NAME = 'object_for_measure';
        this.LABEL_NAME = 'label_for_measure';
        this.MOUSE_NAME = 'point_for_mouse';
        this.mouseMoved = false;
        this.isCompleted = false;
        this.pointCount = 0; // used to store how many points user have been picked
        this.pointArray = [];
        this.tempFontSize = 0; // used to dymanically calculate a font size
        this.mousedown = (e) => {
            this.mouseMoved = false;
        };
        this.mousemove = (e) => {
            this.mouseMoved = true;
            const point = this.getClosestIntersection(e);
            if (!point) {
                return;
            }
            // update the mouse point
            const geom = this.mousePoint.geometry;
            const pos = (geom.attributes && geom.attributes.position) || undefined;
            if (pos) {
                let i = 0;
                pos.array[i++] = point.x;
                pos.array[i++] = point.y;
                pos.array[i++] = point.z;
                geom.setDrawRange(0, 1);
                pos.needsUpdate = true;
            }
            // store the first point into tempLine
            if (this.mode === MeasureMode.Area && this.pointArray.length > 0) {
                const line = this.tempLine || this.createLine(3);
                const geom = line.geometry;
                const pos = (geom.attributes && geom.attributes.position) || undefined;
                if (pos) {
                    let i = 6; // store the first point as the third point (a bit tricky here)
                    pos.array[i++] = this.pointArray[0].x;
                    pos.array[i++] = this.pointArray[0].y;
                    pos.array[i++] = this.pointArray[0].z;
                }
            }
            // draw the temp line as mouse moves
            if (this.pointArray.length > 0) {
                const p0 = this.pointArray[this.pointArray.length - 1]; // get last point
                const line = this.tempLine || this.createLine(3);
                line.computeLineDistances(); // LineDashedMaterial requires to call this
                const geom = line.geometry;
                const pos = (geom.attributes && geom.attributes.position) || undefined;
                if (pos) {
                    let i = 0;
                    pos.array[i++] = p0.x;
                    pos.array[i++] = p0.y;
                    pos.array[i++] = p0.z;
                    pos.array[i++] = point.x;
                    pos.array[i++] = point.y;
                    pos.array[i++] = point.z;
                    const range = (this.mode === MeasureMode.Area && this.pointArray.length >= 2) ? 3 : 2;
                    geom.setDrawRange(0, range);
                    pos.needsUpdate = true;
                }
                if (this.mode === MeasureMode.Distance) {
                    const dist = p0.distanceTo(point);
                    const text = `${this.numberToString(dist)} ${this.getUnitString()}`; // hard code unit to 'm' here
                    const position = new THREE.Vector3((point.x + p0.x) / 2, (point.y + p0.y) / 2, (point.z + p0.z) / 2);
                    this.updateLabel(line, text, position);
                }
                if (!this.tempLine) {
                    this.scene.add(line); // just add to scene once
                    this.tempLine = line;
                }
            }
        };
        this.mouseup = (e) => {
            // if mouseMoved is ture, then it is probably moving, instead of clicking
            if (!this.mouseMoved) {
                this.onMouseClicked(e);
            }
        };
        this.dblclick = (e) => {
            // double click means to complete the draw operation
            this.complete();
        };
        this.onMouseClicked = (e) => {
            if (!this.raycaster || !this.camera || !this.scene || this.isCompleted) {
                return;
            }
            const point = this.getClosestIntersection(e);
            if (!point) {
                return;
            }
            // double click triggers two click events, we need to avoid the second click here
            const now = Date.now();
            if (this.lastClickTime && (now - this.lastClickTime < 500)) {
                return;
            }
            this.lastClickTime = now;
            const count = this.pointArray.length;
            if (this.points) {
                const geom = this.points.geometry;
                const pos = (geom.attributes && geom.attributes.position) || undefined;
                if (pos && count * 3 + 3 < this.MAX_POINTS) {
                    const i = count * 3;
                    pos.array[i] = point.x;
                    pos.array[i + 1] = point.y;
                    pos.array[i + 2] = point.z;
                    geom.setDrawRange(0, count + 1);
                    pos.needsUpdate = true;
                }
            }
            if ((this.mode === MeasureMode.Distance || this.mode === MeasureMode.Area || this.mode === MeasureMode.Angle) && this.polyline) {
                const geom = this.polyline.geometry;
                const pos = (geom.attributes && geom.attributes.position) || undefined;
                if (pos && count * 3 + 3 < this.MAX_POINTS) {
                    const i = count * 3;
                    pos.array[i] = point.x;
                    pos.array[i + 1] = point.y;
                    pos.array[i + 2] = point.z;
                    geom.setDrawRange(0, count + 1);
                    pos.needsUpdate = true;
                }
                else {
                    console.error('Failed to get attributes.position, or number of points exceeded MAX_POINTS!');
                }
                this.polyline.computeLineDistances(); // LineDashedMaterial requires to call this
            }
            if (this.mode === MeasureMode.Area && this.faces) {
                const geom = this.faces.geometry;
                geom.attributes.position.push(point);
                const len = geom.attributes.vertices.length;
                if (len > 2) {
                    geom.computeVertexNormals();
                }
            }
            // If there is point added, then increase the count. Here we use one counter to count both points and line geometry.
            this.pointArray.push(point);
            if (this.mode === MeasureMode.Angle && this.pointArray.length >= 3) {
                this.complete();
            }
        };
        this.keydown = (e) => {
            if (e.key === 'Enter') {
                this.complete();
            }
            else if (e.key === 'Escape') {
                this.cancel();
            }
        };
        /**
         * The the closest intersection
         * @param e
         */
        this.getClosestIntersection = (e) => {
            if (!this.raycaster || !this.camera || !this.scene || this.isCompleted) {
                return;
            }
            const x = e.clientX;
            const y = e.clientY;
            const mouse = new THREE.Vector2();
            mouse.x = (x / this.renderer.domElement.clientWidth) * 2 - 1; // must use clientWidth rather than width here!
            mouse.y = -(y / this.renderer.domElement.clientHeight) * 2 + 1;
            this.raycaster.setFromCamera(mouse, this.camera);
            let intersects = this.raycaster.intersectObject(this.scene, true) || [];
            if (intersects && intersects.length > 0) {
                // filter out the objects for measurement
                intersects = intersects.filter(item => item.object.name !== this.OBJ_NAME);
                if (intersects.length > 0 && intersects[0].distance < this.MAX_DISTANCE) {
                    return intersects[0].point;
                }
            }
            return null;
        };
        this.mode = mode;
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.css2dRenderer = css2dRenderer;
    }
    get canvas() {
        return this.css2dRenderer.domElement;
    }
    /**
     * Starts the measurement
     */
    open() {
        // add mouse 'click' event, but do not trigger highlight for mouse drag event
        this.canvas.addEventListener('mousedown', this.mousedown);
        this.canvas.addEventListener('mousemove', this.mousemove);
        this.canvas.addEventListener('mouseup', this.mouseup);
        this.canvas.addEventListener('dblclick', this.dblclick);
        window.addEventListener('keydown', this.keydown);
        this.pointArray = [];
        this.raycaster = new THREE.Raycaster();
        // points are required for measuring distance, area and angle
        this.points = this.createPoints();
        this.scene.add(this.points);
        // polyline is required for measuring distance, area and angle
        this.polyline = this.createLine();
        this.scene.add(this.polyline);
        if (this.mode === MeasureMode.Area) {
            this.faces = this.createFaces();
            this.scene.add(this.faces);
        }
        this.isCompleted = false;
        this.renderer.domElement.style.cursor = 'crosshair';
        this.mousePoint = this.createPoints(1, this.MOUSE_NAME, this.MOUSE_MATERIAL);
        this.scene.add(this.mousePoint);
    }
    /**
     * Ends the measurement
     */
    close() {
        this.canvas.removeEventListener('mousedown', this.mousedown);
        this.canvas.removeEventListener('mousemove', this.mousemove);
        this.canvas.removeEventListener('mouseup', this.mouseup);
        this.canvas.removeEventListener('dblclick', this.dblclick);
        window.removeEventListener('keydown', this.keydown);
        this.mousePoint && this.scene.remove(this.mousePoint);
        this.tempLine && this.scene.remove(this.tempLine);
        this.tempLineForArea && this.scene.remove(this.tempLineForArea);
        this.points && this.scene.remove(this.points);
        this.polyline && this.scene.remove(this.polyline);
        this.faces && this.scene.remove(this.faces);
        this.curve && this.scene.remove(this.curve);
        this.pointArray = [];
        this.raycaster = undefined;
        this.mousePoint = undefined;
        this.tempLine = undefined;
        this.tempLineForArea = undefined;
        this.points = undefined;
        this.polyline = undefined;
        this.renderer.domElement.style.cursor = '';
    }
    /**
     * Creates THREE.Points
     */
    createPoints(pointCount = this.MAX_POINTS, name = this.OBJ_NAME, material = this.POINT_MATERIAL) {
        const geom = new THREE.BufferGeometry();
        const pos = new Float32Array(pointCount * 3); // 3 vertices per point
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // the attribute name cannot be 'positions'!
        geom.setDrawRange(0, 0); // do not draw anything yet, otherwise it may draw a point by default
        const obj = new THREE.Points(geom, material);
        obj.name = name;
        return obj;
    }
    /**
     * Creates THREE.Line
     */
    createLine(pointCount = this.MAX_POINTS) {
        const geom = new THREE.BufferGeometry();
        const pos = new Float32Array(pointCount * 3); // 3 vertices per point
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // the attribute name cannot be 'positions'!
        const obj = new THREE.Line(geom, this.LINE_MATERIAL);
        obj.name = this.OBJ_NAME;
        return obj;
    }
    /**
     * Creates THREE.Mesh
     */
    createFaces() {
        const geom = new THREE.BufferGeometry();
        const obj = new THREE.Mesh(geom, this.MESH_MATERIAL);
        obj.name = this.OBJ_NAME;
        return obj;
    }
    /**
     * Draw completed
     */
    complete() {
        if (this.isCompleted) {
            return; // avoid re-entry
        }
        let clearPoints = false;
        let clearPolyline = false;
        // for measure area, we need to make a close surface, then add area label
        const count = this.pointArray.length;
        if (this.mode === MeasureMode.Area && this.polyline) {
            if (count > 2) {
                const p0 = this.pointArray[0];
                const p1 = this.pointArray[1];
                const p2 = this.pointArray[count - 1];
                const dir1 = this.getAngleBisector(p1, p0, p2);
                const geom = this.polyline.geometry;
                const pos = (geom.attributes && geom.attributes.position) || undefined;
                if (pos && count * 3 + 3 < this.MAX_POINTS) {
                    const i = count * 3;
                    pos.array[i] = p0.x;
                    pos.array[i + 1] = p0.y;
                    pos.array[i + 2] = p0.z;
                    geom.setDrawRange(0, count + 1);
                    pos.needsUpdate = true;
                }
                const area = this.calculateArea(this.pointArray);
                const text = `${this.numberToString(area)} ${this.getUnitString()}`;
                const distance = p1.distanceTo(p0);
                const d = distance * 0.4; // distance from label to p0
                const position = p0.clone().add(new THREE.Vector3(dir1.x * d, dir1.y * d, dir1.z * d));
                this.updateLabel(this.polyline, text, position);
            }
            else {
                clearPoints = true;
                clearPolyline = true;
            }
        }
        if (this.mode === MeasureMode.Distance) {
            if (count < 2) {
                clearPoints = true;
            }
        }
        if (this.mode === MeasureMode.Angle && this.polyline) {
            if (count >= 3) {
                const p0 = this.pointArray[0];
                const p1 = this.pointArray[1];
                const p2 = this.pointArray[2];
                const dir0 = new THREE.Vector3(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z).normalize();
                const dir1 = this.getAngleBisector(p0, p1, p2);
                const dir2 = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize();
                const angle = this.calculateAngle(p0, p1, p2);
                const text = `${this.numberToString(angle)} ${this.getUnitString()}`;
                const distance = Math.min(p0.distanceTo(p1), p2.distanceTo(p1));
                const d = distance * 0.2; // distance from label to p1
                const position = p1.clone().add(new THREE.Vector3(dir1.x * d, dir1.y * d, dir1.z * d));
                this.updateLabel(this.polyline, text, position);
                const arcP0 = p1.clone().add(new THREE.Vector3(dir0.x * d, dir0.y * d, dir0.z * d));
                const arcP2 = p1.clone().add(new THREE.Vector3(dir2.x * d, dir2.y * d, dir2.z * d));
                this.curve = this.createCurve(arcP0, position, arcP2);
                this.scene.add(this.curve);
            }
            else {
                clearPoints = true;
                clearPolyline = true;
            }
        }
        // invalid case, clear useless objects
        if (clearPoints && this.points) {
            this.scene.remove(this.points);
            this.points = undefined;
        }
        if (clearPolyline && this.polyline) {
            this.scene.remove(this.polyline);
            this.polyline = undefined;
        }
        this.isCompleted = true;
        this.renderer.domElement.style.cursor = '';
        this.mousePoint && this.scene.remove(this.mousePoint);
        this.tempLine && this.scene.remove(this.tempLine);
        this.tempLineForArea && this.scene.remove(this.tempLineForArea);
    }
    /**
     * Draw canceled
     */
    cancel() {
        this.close();
    }
    /**
     * Adds or update label
     */
    updateLabel(obj, text, position) {
        if (this.label) {
            this.label.position.copy(position);
        }
        else {
            const element = document.createElement('div');
            element.textContent = text;
            Object.assign(element.style, {
                fontSize: '15px',
                color: 'red',
                backgroundColor: 'rgba(255,255,255,0.5)',
                padding: '10px',
            });
            const label = new CSS2DObject(element);
            label.position.copy(position);
            obj.add(label);
            this.label = label;
        }
    }
    /**
     * Creates the arc curve to indicate the angle in degree
     */
    createCurve(p0, p1, p2) {
        const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
        const points = curve.getPoints(4); // get points
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const obj = new THREE.Line(geometry, this.LINE_MATERIAL);
        obj.name = this.LABEL_NAME;
        return obj;
    }
    /**
     * Calculates area
     * TODO: for concave polygon, the value doesn't right, need to fix it
     * @param points
     */
    calculateArea(points) {
        let area = 0;
        for (let i = 0, j = 1, k = 2; k < points.length; j++, k++) {
            const a = points[i].distanceTo(points[j]);
            const b = points[j].distanceTo(points[k]);
            const c = points[k].distanceTo(points[i]);
            const p = (a + b + c) / 2;
            area += Math.sqrt(p * (p - a) * (p - b) * (p - c));
        }
        return area;
    }
    /**
     * Gets included angle of two lines in degree
     */
    calculateAngle(startPoint, middlePoint, endPoint) {
        const p0 = startPoint;
        const p1 = middlePoint;
        const p2 = endPoint;
        const dir0 = new THREE.Vector3(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z);
        const dir1 = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
        const angle = dir0.angleTo(dir1);
        return angle * 180 / Math.PI; // convert to degree
    }
    /**
     * Gets angle bisector of two lines
     */
    getAngleBisector(startPoint, middlePoint, endPoint) {
        const p0 = startPoint;
        const p1 = middlePoint;
        const p2 = endPoint;
        const dir0 = new THREE.Vector3(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z).normalize();
        const dir2 = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize();
        return new THREE.Vector3(dir0.x + dir2.x, dir0.y + dir2.y, dir0.z + dir2.z).normalize(); // the middle direction between dir0 and dir2
    }
    /**
     * Gets unit string for distance, area or angle
     */
    getUnitString() {
        if (this.mode === MeasureMode.Distance)
            return 'm';
        if (this.mode === MeasureMode.Area)
            return 'm²';
        if (this.mode === MeasureMode.Angle)
            return '°';
        return '';
    }
    /**
     * Converts a number to a string with proper fraction digits
     */
    numberToString(num) {
        if (num < 0.0001) {
            return num.toString();
        }
        let fractionDigits = 2;
        if (num < 0.01) {
            fractionDigits = 4;
        }
        else if (num < 0.1) {
            fractionDigits = 3;
        }
        return num.toFixed(fractionDigits);
    }
}
