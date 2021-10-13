import {
	Mesh,
	TextureLoader,
	Color,
	ClampToEdgeWrapping,
	RepeatWrapping,
	RGBAFormat,
	DataTexture,
	Clock,
	Vector3,
	CatmullRomCurve3,
	TubeGeometry,
	MeshPhongMaterial,
	DoubleSide,
	MeshBasicMaterial,
	LineCurve3,
} from "../../build/three.module.js";

function createDataTexture(options) {
	let texture;

	const config = {
		offsetx: 0,
		offsety: 0,
		repeatx: 1,
		repeaty: 1,
		image: "",
		rotation: 0,
		opacity: 1,
	};

	Object.assign(config, options);

	if (!config.image) {
		const width = 2;
		const height = 1;

		const size = width * height;
		const data = new Uint8Array(4 * size);
		const colors = [
			[255, 255, 255, 255],
			[0, 0, 0, 0],
		];

		for (let i = 0; i < size; i++) {
			const stride = i * 4;
			const color = colors[i];
			data[stride] = color[0];
			data[stride + 1] = color[1];
			data[stride + 2] = color[2];
			data[stride + 3] = color[3];
		}

		texture = new DataTexture(data, width, height, RGBAFormat);
	} else {
		texture = new TextureLoader().load(config.image);
	}

	texture.needsUpdate = true;

	// 设置阵列模式 RepeatWrapping
	texture.wrapS = config.image ? RepeatWrapping : ClampToEdgeWrapping;
	texture.wrapT = RepeatWrapping;
	texture.repeat.x = config.repeatx;
	texture.repeat.y = config.repeaty;
	// 设置x方向的重复数(沿着管道路径方向)
	// 设置y方向的重复数(环绕管道方向)
	texture.offset.x = config.offsetx;
	texture.offset.y = config.offsety;
	texture.rotation = config.rotation;

	return texture;
}

class Tube extends Mesh {
	constructor(pathArray, options = {}) {
		// 创建几何
		const curveArr = [];
		for (let i = 0; i < pathArray.length; i += 3) {
			curveArr.push(
				new Vector3(pathArray[i], pathArray[i + 1], pathArray[i + 2])
			);
		}
		const curve = new CatmullRomCurve3(curveArr);

		const tubeGeometry = new TubeGeometry(
			curve,
			64,
			options.radius || 1,
			8,
			false
		);

		const texture = createDataTexture(options);

		const material = new MeshBasicMaterial({
			map: texture,
			transparent: true,
			color: options.color || new Color(0x00ffff),
			opacity:
				options.opacity === undefined || options.opacity === null
					? 1
					: options.opacity,
			// side: DoubleSide,
			// depthTest: false,
			// depthWrite: false
		});

		// const basicMaterial = new MeshBasicMaterial({
		//   color: 0x001155,
		//   side: DoubleSide,
		//   transparent: true,
		//   opacity: 1,
		//   depthTest: false
		// });

		super(tubeGeometry, material);

		this.type = "Tube";

		this.clock = new Clock();

		this.texture = texture;
		let speed = options.speed;
		if (speed === undefined || speed === null) {
			speed = 1;
		}
		this.speed = speed;
		this.options = options;
	}

	onBeforeRender(renderer, scene, camera) {
		const delta = this.clock.getDelta();
		this.texture.offset.x -= delta * this.speed;
		if (!this.options.image && this.texture.offset.x < -0.5) {
			this.texture.offset.x = 0.5;
		}
	}
}

export default Tube;
