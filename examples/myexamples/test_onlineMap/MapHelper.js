import * as THREE from "../../../build/three.module.js";

class MapHelper {
	constructor(viewer, options) {
		this.scene = viewer.scene;
		this.tiles = new THREE.Group();
		this.tiles.name = "map-tiles";
		this.scene.add(this.tiles);

		this.sceneTileSize = 50;
		this.mapTileSize = 256;
		this.halfXRange = 20037508.3427892;

		if (options) {
			this.sceneTileSize = options.mapTileSize || 50;
			this.mapTileSize = options.mapTileSize || 256;
			this.halfXRange = options.halfXRange || 20037508.3427892;
		}

		this.centerLng = 0;
		this.centerLat = 0;
		this.level = 18;

		const axes = new THREE.AxesHelper(50);
		this.scene.add(axes);
	}

	loadMap(lng, lat, loadLevel = 18, xCount = 1, yCount = 1) {
		this.centerLat = lat;
		this.centerLng = lng;
		this.level = loadLevel;
		this.sceneTileSize = (this.halfXRange * 2) / 2 ** this.level;

		const webMercator = MapHelper._lonLat2WebMercator(lng, lat);
		const tilePos = this._webMercator2TileImage(webMercator.x, webMercator.y);

		// 以centerLng所在点tile中心点为中心，加载tile
		this.loadMapTile(tilePos.tileinfo.x, tilePos.tileinfo.y, xCount, yCount);
	}

	/**
	 * 加载地图
	 * @param {*} startX
	 * @param {*} startY
	 */
	loadMapTile(startX, startY, xCount, yCount) {
		const me = this;
		for (let i = 0; i < xCount; i += 1) {
			for (let j = 0; j < yCount; j += 1) {
				MapHelper._loadImageTile(
					this.level,
					i + startX,
					startY - j,
					this.sceneTileSize
				).then((mesh) => {
					// 加载切片到场景
					const x = this.sceneTileSize * i;
					const y = -this.sceneTileSize * j;
					mesh.position.x = x;
					mesh.position.z = y;
					mesh.name = `${this.level}-${x}${y}`;
					me.tiles.add(mesh);
					// console.log(
					// 	`tile ${level} ${i + startX} ${startY - j} added`,
					// 	{
					// 		x,
					// 		y: 0,
					// 		z: y,
					// 	}
					// );
				});
			}
		}
	}

	/**
	 * 经纬度转web墨卡托
	 * @param {*} lng
	 * @param {*} lat
	 * @returns
	 */
	static _lonLat2WebMercator(lng, lat) {
		const x = (lng / 180.0) * 20037508.3427892;
		let y;
		if (lat > 85.05112) {
			lat = 85.05112;
		}
		if (lat < -85.05112) {
			lat = -85.05112;
		}
		y = (Math.PI / 180.0) * lat;
		const tmp = Math.PI / 4.0 + y / 2.0;
		y = (20037508.3427892 * Math.log(Math.tan(tmp))) / Math.PI;
		const result = {
			x,
			y,
		};
		return result;
	}

	/**
	 * Web墨卡托转成tile上的像素坐标，返回像素坐标，以及tile编号，在所在tile上的偏移
	 * @param {*} x
	 * @param {*} y
	 * @returns
	 */
	_webMercator2TileImage(x, y) {
		y = this.halfXRange - y;
		x = this.halfXRange + x;
		const size = 2 ** this.level * this.mapTileSize;

		const imgx = (x * size) / (this.halfXRange * 2);
		const imgy = (y * size) / (this.halfXRange * 2);
		// 当前位置在全球切片编号
		const col = Math.floor(imgx / this.mapTileSize);
		const row = Math.floor(imgy / this.mapTileSize);
		// console.log('col', col, 'row', row);
		// 当前位置对应于tile图像中的位置
		const imgdx = imgx % this.mapTileSize;
		const imgdy = imgy % this.mapTileSize;

		// 像素坐标
		const position = {
			x: imgx,
			y: imgy,
		};
		// tile编号
		const tileinfo = {
			x: col,
			y: row,
			level: 18,
		};
		// 在所在tile上的偏移
		const offset = {
			x: imgdx,
			y: imgdy,
		};

		const result = {
			position,
			tileinfo,
			offset,
		};
		return result;
	}

	/**
	 * 经纬度到tile，再到WebGL坐标
	 * @param {*} lng
	 * @param {*} lat
	 * @returns
	 */
	_lonLat2WebGL(lng, lat) {
		const webMercator = MapHelper._lonLat2WebMercator(lng, lat);
		const tilePos = this._webMercator2TileImage(
			webMercator.x,
			webMercator.y
		).position;

		const centerWM = MapHelper._lonLat2WebMercator(
			this.centerLng,
			this.centerLat
		);
		const centerTP = this._webMercator2TileImage(centerWM.x, centerWM.y);
		// 相对偏移修正（以centerLng,centerLat所在点tile中心点为原点，导致的偏移）
		const x =
			((tilePos.x -
				centerTP.position.x +
				(centerTP.offset.x - this.mapTileSize / 2)) *
				this.sceneTileSize) /
			this.mapTileSize;
		const y =
			((tilePos.y -
				centerTP.position.y +
				(-centerTP.offset.y + this.mapTileSize / 2)) *
				this.sceneTileSize) /
			this.mapTileSize;

		const result = {
			x,
			y,
		};

		return result;
	}

	/**
	 * 加载一个切图
	 * @param {Object} xno tile编号x
	 * @param {Object} yno tile编号y
	 * @param {Object} callback
	 */
	static _loadImageTile(level, xno, yno, sceneTileSize) {
		return new Promise((resolve) => {
			// const sub = 0;
			const url = `https://t0.tianditu.gov.cn/DataServer?T=img_w&X=${xno}&Y=${yno}&L=${level}&tk=16db5f2b05abef1bc22c88924a318eb0`;
			const loader = new THREE.TextureLoader();
			// 跨域加载图片
			loader.crossOrigin = true;
			loader.load(url, (texture) => {
				const geometry = new THREE.PlaneGeometry(sceneTileSize, sceneTileSize);
				const material = new THREE.MeshBasicMaterial({
					map: texture,
					// transparent: true,
					side: THREE.DoubleSide, // 双面显示
				});
				const mesh = new THREE.Mesh(geometry, material);
				mesh.rotation.x = -Math.PI / 2;
				resolve(mesh);
			});
		});
	}
}

export default MapHelper;
