import * as THREE from '../../build/three.module.js';
import { CSS2DRenderer, CSS2DObject } from '../jsm/renderers/CSS2DRenderer.js';

export enum MeasureMode {
	Distance = 'Distance',
	Area = 'Area',
	Angle = 'Angle'
}

const pointTexture = new THREE.TextureLoader().load('./circle.png');

/**
 * Measure class
 */
export default class Measure {
	// lineWidth is ignored for Chrome on Windows, which is a known issue:
	// https://github.com/mrdoob/three.js/issues/269
	// line color: 0x87cefa, point color: 0x74e0d0
	readonly LINE_MATERIAL = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3, opacity: 0.8, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
	readonly POINT_MATERIAL = new THREE.PointsMaterial({ color: 0x00ff00, map: pointTexture, size: 5, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false });
	readonly MESH_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x87cefa, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
	readonly MOUSE_MATERIAL = new THREE.PointsMaterial({ color: 0xff0000, map: pointTexture, size: 10, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false });
	readonly MAX_POINTS = 100; // TODO: better to remove this limitation
	readonly MAX_DISTANCE = 500; // when intersected object's distance is too far away, then ignore it
	readonly OBJ_NAME = 'object_for_measure';
	readonly LABEL_NAME = 'label_for_measure';

	mode: MeasureMode;
	renderer: THREE.WebGLRenderer;
	css2dRenderer: CSS2DRenderer;
	scene: THREE.Scene;
	camera: THREE.Camera;
	raycaster?: THREE.Raycaster;
	mouseMoved = false;
	isCompleted = false;
	measurePoints?: THREE.Points; // used for measure distance and area
	measureLine?: THREE.Line; // the line user draws while measuring distance
	faces?: THREE.Mesh; // the faces user draws while measuring area
	curve?: THREE.Line; // the arc curve to indicate the angle in degree
	mousePoint: THREE.Points; // used to store temporary Points
	tempLine?: THREE.Line; // used to store temporary line, which is useful for drawing line as mouse moves
	pointCount = 0; // used to store how many points user have been picked
	pointArray: THREE.Vector3[] = [];
	lastClickTime?: number; // save the last click time, in order to detect double click event
	label?: CSS2DObject;
	measureResult: number = 0;

	constructor(renderer: THREE.WebGLRenderer, css2dRenderer: CSS2DRenderer, scene: THREE.Scene, camera: THREE.Camera, mode: MeasureMode = MeasureMode.Distance) {
		this.mode = mode;
		this.renderer = renderer;
		this.scene = scene;
		this.camera = camera;
		this.css2dRenderer = css2dRenderer;
	}

	get canvas(): HTMLDivElement {
		return this.css2dRenderer.domElement as HTMLDivElement;
	}

	/**
	 * Starts the measurement
	 */
	open() {

		this.close();

		// add mouse 'click' event, but do not trigger highlight for mouse drag event
		this.canvas.addEventListener('mousedown', this.mousedown);
		this.canvas.addEventListener('mousemove', this.mousemove);
		this.canvas.addEventListener('mouseup', this.mouseup);
		this.canvas.addEventListener('dblclick', this.dblclick);
		window.addEventListener('keydown', this.keydown);

		this.pointArray = [];
		this.raycaster = new THREE.Raycaster();
		this.measureResult = 0;

		// points are required for measuring distance, area and angle
		this.measurePoints = new THREE.Points(new THREE.BufferGeometry(), this.POINT_MATERIAL);
		this.measurePoints.name = 'measure-points';
		this.scene.add(this.measurePoints);
		// polyline is required for measuring distance, area and angle
		this.measureLine = new THREE.Line(new THREE.BufferGeometry(), this.LINE_MATERIAL);
		this.measureLine.name = 'mesaure-line';
		this.scene.add(this.measureLine);
		// change with mouse movement
		this.tempLine = new THREE.Line(new THREE.BufferGeometry(), this.LINE_MATERIAL);
		this.tempLine.name = 'moving-line';
		let count = 2;
		if (this.mode === MeasureMode.Area) count = 3;
		this.tempLine.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
		this.tempLine.visible = false;
		this.scene.add(this.tempLine);

		if (this.mode === MeasureMode.Area) {
			this.faces = new THREE.Mesh(new THREE.BufferGeometry(), this.MESH_MATERIAL);
			this.faces.name = 'measure-polygon';
			this.scene.add(this.faces);
		}

		if (this.mode === MeasureMode.Angle) {
			this.curve = new THREE.Line(new THREE.BufferGeometry(), this.LINE_MATERIAL);
			this.curve.name = 'mesaure-angle-curve';
			this.scene.add(this.curve);
		}

		this.isCompleted = false;
		this.canvas.style.cursor = 'crosshair';

		this.mousePoint = new THREE.Points(new THREE.BufferGeometry(), this.MOUSE_MATERIAL);
		this.mousePoint.name = 'measure-mouse-point';
		this.scene.add(this.mousePoint);

		this.updateLabel('', new THREE.Vector3(), false);
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
		this.measurePoints && this.scene.remove(this.measurePoints);
		this.measureLine && this.scene.remove(this.measureLine);
		this.faces && this.scene.remove(this.faces);
		this.curve && this.scene.remove(this.curve);
		this.label && this.scene.remove(this.label);
		this.pointArray = [];
		this.raycaster = undefined;
		this.mousePoint = undefined;
		this.tempLine = undefined;
		this.measurePoints = undefined;
		this.measureLine = undefined;
		this.canvas.style.cursor = '';
		this.measureResult = 0;
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

		const count = this.pointArray.length;

		if (this.mode === MeasureMode.Area) {
			// for measure area, we need to make a close surface, then add area label
			if (count > 2) {
				const p0 = this.pointArray[0];
				const p1 = this.pointArray[1];
				const p2 = this.pointArray[count - 1];

				const attr = this.measureLine.geometry.getAttribute("position");
				const oldLength = attr.length;
				const newPosition = new Float32Array(oldLength + 3);
				newPosition.set(attr.array);
				newPosition[oldLength] = p0.x;
				newPosition[oldLength + 1] = p0.y;
				newPosition[oldLength + 2] = p0.z;
				this.measureLine.geometry.setAttribute("position", new THREE.BufferAttribute(newPosition, 3));

				const area = this.calculateArea(this.pointArray);
				const text = `${this.numberToString(area)} ${this.getUnitString()}`;
				this.updateLabel(text, p2);
			} else {
				clearPoints = true;
				clearPolyline = true;
			}
		}

		if (this.mode === MeasureMode.Distance) {
			if (count < 2) {
				clearPoints = true;
			}
		}

		if (this.mode === MeasureMode.Angle) {
			if (count > 2) {
				this.updateCurve(this.pointArray[0], this.pointArray[1], this.pointArray[2]);
			} else {
				clearPoints = true;
				clearPolyline = true;
			}
		}

		// invalid case, clear useless objects
		if (clearPoints) {
			this.scene.remove(this.measurePoints);
			this.measurePoints = undefined;
		}
		if (clearPolyline) {
			this.scene.remove(this.measureLine);
			this.measureLine = undefined;
		}
		this.isCompleted = true;
		this.canvas.style.cursor = '';
		this.mousePoint && this.scene.remove(this.mousePoint);
		this.tempLine && this.scene.remove(this.tempLine);

		// this.open();
	}

	/**
	 * Draw canceled
	 */
	cancel() {
		this.close();
	}

	mousedown = (e: MouseEvent) => {
		this.mouseMoved = false;
	};

	mousemove = (e: MouseEvent) => {

		if (this.isCompleted) return;

		this.mouseMoved = true;

		const point = this.getClosestIntersection(e);
		if (!point) {
			return;
		}

		// update the mouse point
		this.mousePoint.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(point.toArray()), 3));

		// draw the temp line as mouse moves
		if (this.pointArray.length > 0) {
			const p0 = this.pointArray[this.pointArray.length - 1]; // get last point
			const attr = this.tempLine.geometry.getAttribute("position");
			const pos = attr.array;
			let i = 0;
			pos[i++] = p0.x;
			pos[i++] = p0.y;
			pos[i++] = p0.z;
			pos[i++] = point.x;
			pos[i++] = point.y;
			pos[i++] = point.z;
			attr.needsUpdate = true;

			this.tempLine.visible = true;

			if (this.mode === MeasureMode.Distance) {
				const dist = p0.distanceTo(point);
				const text = `${this.numberToString(dist + this.measureResult)} ${this.getUnitString()}`; // hard code unit to 'm' here
				// const position = new THREE.Vector3((point.x + p0.x) / 2, (point.y + p0.y) / 2, (point.z + p0.z) / 2);
				this.updateLabel(text, point);
			}

			if (this.mode === MeasureMode.Area) {
				// add line between the mouse and the first point
				let i = 6; // store the first point as the third point (a bit tricky here)
				pos[i++] = this.pointArray[0].x;
				pos[i++] = this.pointArray[0].y;
				pos[i++] = this.pointArray[0].z;

				if (this.pointArray.length > 1) {
					const tempArray = [];
					this.pointArray.forEach(p => {
						tempArray.push(...p.toArray());
					});
					tempArray.push(...point.toArray());

					this.faces.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tempArray), 3));
					const length = this.pointArray.length + 1;
					const indices = [];
					for (let i = 2; i < length; i += 1) {
						indices.push(length - 1, i - 2, i - 1);
					}
					this.faces.geometry.setIndex(indices);

					const area = this.calculateArea(this.pointArray.concat(point));
					const text = `${this.numberToString(area)} ${this.getUnitString()}`;
					this.updateLabel(text, point);

				}
			}
		}


		if (this.pointArray.length === 2 && this.mode === MeasureMode.Angle) {
			this.updateCurve(this.pointArray[0], this.pointArray[1], point);
		}
	};

	mouseup = (e: MouseEvent) => {
		// if mouseMoved is ture, then it is probably moving, instead of clicking
		if (!this.mouseMoved) {
			this.onMouseClicked(e);
		}
	};

	dblclick = (e: MouseEvent) => {
		// double click means to complete the draw operation
		this.complete();
	};

	onMouseClicked = (e: MouseEvent) => {
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

		// If there is point added, then increase the count. Here we use one counter to count both points and line geometry.
		this.pointArray.push(point);
		if (this.mode === MeasureMode.Angle && this.pointArray.length >= 3) {
			this.complete();
		}

		const length = this.pointArray.length;

		if (length > 1) {
			this.measureResult += this.pointArray[length - 1].distanceTo(this.pointArray[length - 2]);
		}

		const positionAttribute = this.measurePoints.geometry.getAttribute("position");
		if (!positionAttribute) {
			this.measurePoints.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(point.toArray()), 3));
		} else {
			const oldLength = positionAttribute.array.length;
			const newPosition = new Float32Array(oldLength + 3);
			newPosition.set(positionAttribute.array);
			newPosition[oldLength] = point.x;
			newPosition[oldLength + 1] = point.y;
			newPosition[oldLength + 2] = point.z;
			this.measurePoints.geometry.setAttribute("position", new THREE.BufferAttribute(newPosition, 3));
		}

		if ((this.mode === MeasureMode.Distance || this.mode === MeasureMode.Area || this.mode === MeasureMode.Angle) && length > 1) {
			this.measureLine.geometry.setAttribute("position", this.measurePoints.geometry.getAttribute("position").clone());
		}

		if (this.mode === MeasureMode.Area && length > 2) {
			this.faces.geometry.setAttribute("position", this.measurePoints.geometry.getAttribute("position").clone());
			const indices = [];
			for (let i = 2; i < length; i += 1) {
				indices.push(length - 1, i - 2, i - 1);
			}
			this.faces.geometry.setIndex(indices);
		}
	};

	keydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			this.complete();
		} else if (e.key === 'Escape') {
			this.cancel();
		}
	};

	/**
	 * The the closest intersection
	 * @param e
	 */
	getClosestIntersection = (e: MouseEvent) => {
		if (!this.raycaster || !this.camera || !this.scene) {
			return;
		}
		const x = e.clientX;
		const y = e.clientY;
		const mouse = new THREE.Vector2();
		mouse.x = (x / this.canvas.clientWidth) * 2 - 1; // must use clientWidth rather than width here!
		mouse.y = -(y / this.canvas.clientHeight) * 2 + 1;

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

	/**
	 * Adds or update label
	 */
	updateLabel(text: string, position: THREE.Vector3, visible: boolean = true) {
		if (this.label) {
			this.label.element.children[0].textContent = text;
			this.label.position.copy(position);
			this.label.visible = visible;
		} else {
			const element = document.createElement('div');
			const child = document.createElement("div");
			child.textContent = text;
			Object.assign(child.style, {
				fontSize: '15px',
				color: 'red',
				backgroundColor: 'rgba(255,255,255,0.5)',
				padding: '5px',
				transform: 'translateY(-40px)'
			});
			element.appendChild(child);
			const label = new CSS2DObject(element);
			label.position.copy(position);
			label.visible = visible;
			this.label = label;
			this.scene.add(this.label);
		}

	}

	/**
	 * Updates the arc curve to indicate the angle in degree
	 */
	updateCurve(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3) {
		const dir0 = new THREE.Vector3(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z).normalize();
		const dir1 = this.getAngleBisector(p0, p1, p2);
		const dir2 = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize();
		const angle = this.calculateAngle(p0, p1, p2);
		const text = `${this.numberToString(angle)} ${this.getUnitString()}`;
		const distance = Math.min(p0.distanceTo(p1), p2.distanceTo(p1));
		const d = distance * 0.2; // distance from label to p1
		const position = p1.clone().add(new THREE.Vector3(dir1.x * d, dir1.y * d, dir1.z * d));
		this.updateLabel(text, position);

		const arcP0 = p1.clone().add(new THREE.Vector3(dir0.x * d, dir0.y * d, dir0.z * d));
		const arcP2 = p1.clone().add(new THREE.Vector3(dir2.x * d, dir2.y * d, dir2.z * d));

		const curve = new THREE.QuadraticBezierCurve3(arcP0, position, arcP2);
		const points = curve.getPoints(4); // get points
		this.curve.geometry = new THREE.BufferGeometry().setFromPoints(points);
	}

	/**
	 * Calculates area
	 * TODO: for concave polygon, the value doesn't right, need to fix it
	 * @param points
	 */
	calculateArea(points: THREE.Vector3[]) {
		let area = 0;
		const last = points[points.length - 1];
		for (let i = 0; i < points.length - 2; i++) {
			const a = points[i].distanceTo(last);
			const b = points[i + 1].distanceTo(last);
			const c = points[i].distanceTo(points[i + 1]);
			const p = (a + b + c) / 2;
			area += Math.sqrt(p * (p - a) * (p - b) * (p - c));
		}
		return area;
	}

	/**
	 * Gets included angle of two lines in degree
	 */
	calculateAngle(startPoint: THREE.Vector3, middlePoint: THREE.Vector3, endPoint: THREE.Vector3) {
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
	getAngleBisector(startPoint: THREE.Vector3, middlePoint: THREE.Vector3, endPoint: THREE.Vector3): THREE.Vector3 {
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
		if (this.mode === MeasureMode.Distance) return 'm';
		if (this.mode === MeasureMode.Area) return 'm²';
		if (this.mode === MeasureMode.Angle) return '°';
		return '';
	}

	/**
	 * Converts a number to a string with proper fraction digits
	 */
	numberToString(num: number) {
		if (num < 0.0001) {
			return num.toString();
		}
		let fractionDigits = 2;
		if (num < 0.01) {
			fractionDigits = 4;
		} else if (num < 0.1) {
			fractionDigits = 3;
		}
		return num.toFixed(fractionDigits);
	}
}
