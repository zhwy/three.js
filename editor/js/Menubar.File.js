/**
 * @author mrdoob / http://mrdoob.com/
 */

Menubar.File = function(editor) {
	import { UIPanel, UIRow, UIHorizontalRule } from "./libs/ui.js";

	function MenubarFile(editor) {
		var config = editor.config;
		var strings = editor.strings;

		var container = new UIPanel();
		container.setClass("menu");

		var title = new UI.Panel();
		title.setClass("title");
		title.setTextContent("File");
		container.add(title);

		var options = new UI.Panel();
		options.setClass("options");
		container.add(options);

		// New

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("New");
		option.onClick(function() {
			if (confirm("Any unsaved data will be lost. Are you sure?")) {
				editor.clear();
			}
		});
		options.add(option);

		//

		options.add(new UI.HorizontalRule());

		// Import

		var fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.addEventListener("change", function(event) {
			editor.loader.loadFile(fileInput.files[0]);
		});

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Import");
		option.onClick(function() {
			fileInput.click();
		});
		options.add(option);

		//

		options.add(new UI.HorizontalRule());

		// Export Geometry

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Export Geometry");
		option.onClick(function() {
			var object = editor.selected;

			if (object === null) {
				alert("No object selected.");
				return;
			}

			var geometry = object.geometry;

			if (geometry === undefined) {
				alert("The selected object doesn't have geometry.");
				return;
			}

			var output = geometry.toJSON();

			try {
				output = JSON.stringify(output, null, "\t");
				output = output.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
			} catch (e) {
				output = JSON.stringify(output);
			}

			saveString(output, "geometry.json");
		});
		options.add(option);

		// Export Object

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Export Object");
		option.onClick(function() {
			var object = editor.selected;

			if (object === null) {
				alert("No object selected");
				return;
			}

			var output = object.toJSON();

			try {
				output = JSON.stringify(output, null, "\t");
				output = output.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
			} catch (e) {
				output = JSON.stringify(output);
			}

			saveString(output, "model.json");
		});
		options.add(option);

		// Export Scene

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Export Scene");
		option.onClick(function() {
			var output = editor.scene.toJSON();

			try {
				output = JSON.stringify(output, null, "\t");
				output = output.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");
			} catch (e) {
				output = JSON.stringify(output);
			}

			saveString(output, "scene.json");
		});
		options.add(option);

		//

		options.add(new UIHorizontalRule());

		// Export DAE

		var option = new UIRow();
		option.setClass("option");
		option.setTextContent(strings.getKey("menubar/file/export/dae"));
		option.onClick(async function() {
			var { ColladaExporter } = await import(
				"../../examples/jsm/exporters/ColladaExporter.js"
			);

			var exporter = new ColladaExporter();

			exporter.parse(editor.scene, function(result) {
				saveString(result.data, "scene.dae");
			});
		});
		options.add(option);

		// Export DRC

		var option = new UIRow();
		option.setClass("option");
		option.setTextContent(strings.getKey("menubar/file/export/drc"));
		option.onClick(async function() {
			var object = editor.selected;

			if (object === null || object.isMesh === undefined) {
				alert("No mesh selected");
				return;
			}

			var { DRACOExporter } = await import(
				"../../examples/jsm/exporters/DRACOExporter.js"
			);

			var exporter = new DRACOExporter();

			const options = {
				decodeSpeed: 5,
				encodeSpeed: 5,
				encoderMethod: DRACOExporter.MESH_EDGEBREAKER_ENCODING,
				quantization: [16, 8, 8, 8, 8],
				exportUvs: true,
				exportNormals: true,
				exportColor: object.geometry.hasAttribute("color"),
			};

			// TODO: Change to DRACOExporter's parse( geometry, onParse )?
			var result = exporter.parse(object, options);
			saveArrayBuffer(result, "model.drc");
		});
		options.add(option);

		// Export GLB

		var option = new UIRow();
		option.setClass("option");
		option.setTextContent(strings.getKey("menubar/file/export/glb"));
		option.onClick(async function() {
			var scene = editor.scene;
			var animations = getAnimations(scene);

			var { GLTFExporter } = await import(
				"../../examples/jsm/exporters/GLTFExporter.js"
			);

			var exporter = new GLTFExporter();

			exporter.parse(
				scene,
				function(result) {
					saveArrayBuffer(result, "scene.glb");
				},
				{ binary: true, animations: animations }
			);
		});
		options.add(option);

		// Export GLTF

		var option = new UIRow();
		option.setClass("option");
		option.setTextContent(strings.getKey("menubar/file/export/gltf"));
		option.onClick(async function() {
			var scene = editor.scene;
			var animations = getAnimations(scene);

			var { GLTFExporter } = await import(
				"../../examples/jsm/exporters/GLTFExporter.js"
			);

			var exporter = new GLTFExporter();

			exporter.parse(
				scene,
				function(result) {
					saveString(JSON.stringify(result, null, 2), "scene.gltf");
				},
				{ animations: animations }
			);
		});
		options.add(option);

		// Export OBJ

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Export OBJ");
		option.onClick(function() {
			var object = editor.selected;

			if (object === null) {
				alert("No object selected.");
				return;
			}

			var exporter = new THREE.OBJExporter();

			saveString(exporter.parse(object), "model.obj");
		});
		options.add(option);

		// Export STL

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Export STL");
		option.onClick(function() {
			var exporter = new THREE.STLExporter();

			saveString(exporter.parse(editor.scene), "model.stl");
		});
		options.add(option);

		//

		options.add(new UI.HorizontalRule());

		// Publish

		var option = new UI.Row();
		option.setClass("option");
		option.setTextContent("Publish");
		option.onClick(function() {
			var zip = new JSZip();

			//

			var output = editor.toJSON();
			output.metadata.type = "App";
			delete output.history;

			output = JSON.stringify(output, null, "\t");
			output = output.replace(/[\n\t]+([\d\.e\-\[\]]+)/g, "$1");

			zip.file("app.json", output);

			//

			var manager = new THREE.LoadingManager(function() {
				save(zip.generate({ type: "blob" }), "download.zip");
			});

			var loader = new THREE.XHRLoader(manager);
			loader.load("js/libs/app/index.html", function(content) {
				var includes = [];

				if (vr) {
					includes.push('<script src="js/VRControls.js"></script>');
					includes.push('<script src="js/VREffect.js"></script>');
				}

				content = content.replace("<!-- includes -->", includes.join("\n\t\t"));

				zip.file("index.html", content);
			});
			loader.load("js/libs/app.js", function(content) {
				zip.file("js/app.js", content);
			});
			loader.load("../build/three.min.js", function(content) {
				zip.file("js/three.min.js", content);
			});

			if (config.getKey('project/editable')) {

				editButton = [
					'			var button = document.createElement( \'a\' );',
					'			button.href = \'https://threejs.org/editor/#file=\' + location.href.split( \'/\' ).slice( 0, - 1 ).join( \'/\' ) + \'/app.json\';',
					'			button.style.cssText = \'position: absolute; bottom: 20px; right: 20px; padding: 10px 16px; color: #fff; border: 1px solid #fff; border-radius: 20px; text-decoration: none;\';',
					'			button.target = \'_blank\';',
					'			button.textContent = \'EDIT\';',
					'			document.body.appendChild( button );',
				].join('\n');

				loader.load("../examples/js/effects/VREffect.js", function(content) {
					zip.file("js/VREffect.js", content);
				});
			}

			content = content.replace('\t\t\t/* edit button */', editButton);

			toZip['index.html'] = strToU8(content);

		});
		loader.load('js/libs/app.js', function(content) {

			toZip['js/app.js'] = strToU8(content);

		});
		loader.load('../build/three.module.js', function(content) {

			toZip['js/three.module.js'] = strToU8(content);

		});
		options.add(option);

		//

		var link = document.createElement("a");
		link.style.display = "none";
		document.body.appendChild(link); // Firefox workaround, see #6594

		function save(blob, filename) {
			link.href = URL.createObjectURL(blob);
			link.download = filename || "data.json";
			link.click();

			// URL.revokeObjectURL( url ); breaks Firefox...
		}

		function saveString(text, filename) {
			save(new Blob([text], { type: "text/plain" }), filename);
		}

		return container;
	}
};
