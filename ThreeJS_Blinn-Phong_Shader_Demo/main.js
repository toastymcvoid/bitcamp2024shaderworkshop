import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import * as AJAX from 'http://cdnjs.cloudflare.com/ajax/libs/three.js/r69/three.min.js';

import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';

//vertex shader for Flat Shading that takes in light direction and calculates camera view of light and of the mesh
const _FlatVS = `

uniform vec3 light_pos;
uniform vec3 light_target;

varying vec3 v_ViewPosition;
varying vec3 v_ViewLightPosition;
varying vec3 v_ViewLightTargetPosition;

void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

	vec4 mvPosition = modelViewMatrix * vec4(position, 1.0 );
	vec4 light_target_mv = modelViewMatrix * vec4(light_target, 1.0);
	vec4 light_pos_mv = modelViewMatrix * vec4(light_pos, 1.0);
	v_ViewPosition = mvPosition.xyz;
	v_ViewLightPosition = light_pos_mv.xyz;
	v_ViewLightTargetPosition = light_target_mv.xyz;
}
`;

//fragment shader for Flat Shading that takes in view of light and of the mesh, calculates face normals, a displays light diffuse
//both light and normals need to be in view space for this to work
const _FlatFS = `

uniform vec3 light_color;

varying vec3 v_ViewPosition;
varying vec3 v_ViewLightPosition;
varying vec3 v_ViewLightTargetPosition;

void main() {
	vec3 faceNormal = normalize( cross( dFdx( v_ViewPosition ), dFdy( v_ViewPosition ) ) );
	vec3 scaled = faceNormal * 0.5 + vec3(0.5);

	vec3 light_direction = normalize(v_ViewLightTargetPosition - v_ViewLightPosition);
	gl_FragColor = vec4(max(dot(-light_direction, faceNormal), 0.0) * light_color, 1.0);
	
	// gl_FragColor = vec4(scaled, 1.0); // outputs the face normal vectors for debugging purposes
}
`;

//vertex shader for Gouraud Shading that calculates color from vertex normals (default glsl normals)
//both light and normals need to be in world space for this to work
const _GouraudVS = `

uniform vec3 light_color;
uniform vec3 light_pos;
uniform vec3 light_target;

varying vec3 v_Color;

void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	
	vec4 normal_mv = inverse(transpose(modelMatrix)) * vec4(normal, 0.0);
	vec3 normals = normalize(normal_mv.xyz);
	vec3 light_direction = normalize(light_target - light_pos);

	v_Color = max(dot(-light_direction, normals), 0.0) * light_color;
}
`;

//fragment shader for Gouraud Shading that takes in colors and interpolates
const _GouraudFS = `

varying vec3 v_Color;

void main() {
	gl_FragColor = vec4(v_Color, 1.0);
}
`;

//vertex shader for Phong Shading that just interpolated vertex normals (default glsl normals)
const _PhongVS = `

uniform vec3 light_pos;
uniform vec3 light_target;

varying vec3 v_ViewLightPosition;
varying vec3 v_ViewLightTargetPosition;

varying vec3 v_NormalInterp;
varying vec3 v_VertPos;

void main() {
	vec4 vertPos4 = modelViewMatrix * vec4(position, 1.0);
	v_VertPos = vertPos4.xyz;
	v_NormalInterp = normalMatrix * normal;
	gl_Position = projectionMatrix * vertPos4;

	vec4 light_target_mv = viewMatrix * vec4(light_target, 1.0);
	vec4 light_pos_mv = viewMatrix * vec4(light_pos, 1.0);
	v_ViewLightPosition = light_pos_mv.xyz;
	v_ViewLightTargetPosition = light_target_mv.xyz;
}
`;

//fragment shader for Phong Shading that takes in the interpolated normals and displays light diffuse + ambient + specular
//both light and normals need to be in view space for this to work
const _PhongFS = `

uniform vec3 diffuse_color;
uniform vec3 ambient_color;
uniform vec3 specular_color;

varying vec3 v_ViewLightPosition;
varying vec3 v_ViewLightTargetPosition;

varying vec3 v_NormalInterp;
varying vec3 v_VertPos;

void main() {
	vec3 scaled = v_NormalInterp * 0.5 + vec3(0.5);
	
	vec3 normal = normalize(v_NormalInterp);
	vec3 light_direction = normalize(v_ViewLightTargetPosition - v_ViewLightPosition);
	
	float lambertian = max(dot(-light_direction, normal), 0.0);
	float specular = 0.0;
	if (lambertian > 0.0) {
		vec3 reflection = reflect(light_direction, normal);
		vec3 viewer = normalize(-v_VertPos);
		specular = pow(max(dot(reflection, viewer), 0.0), 70.0);
	}
	
	gl_FragColor = vec4(lambertian * diffuse_color + ambient_color + specular * specular_color, 1.0);
}
`;

//vertex shader for Blinn-Phong Shading that passes interpolated vertex normals
const _BPVS = `

uniform vec3 light_pos;
uniform vec3 light_target;

varying vec3 v_ViewLightPosition;
varying vec3 v_ViewLightTargetPosition;

varying vec3 v_NormalInterp;
varying vec3 v_VertPos;

void main() {
	vec4 vertPos4 = modelViewMatrix * vec4(position, 1.0);
	v_VertPos = vertPos4.xyz;
	v_NormalInterp = normalMatrix * normal;
	gl_Position = projectionMatrix * vertPos4;

	vec4 light_target_mv = viewMatrix * vec4(light_target, 1.0);
	vec4 light_pos_mv = viewMatrix * vec4(light_pos, 1.0);
	v_ViewLightPosition = light_pos_mv.xyz;
	v_ViewLightTargetPosition = light_target_mv.xyz;
}
`;

//fragment shader for Blinn-Phong Shading that takes in the interpolated normals and displays light diffuse + ambient + specular
//both light and normals need to be in view space for this to work
const _BPFS = `

uniform vec3 diffuse_color;
uniform vec3 ambient_color;
uniform vec3 specular_color;

varying vec3 v_ViewLightPosition;
varying vec3 v_ViewLightTargetPosition;

varying vec3 v_NormalInterp;
varying vec3 v_VertPos;

void main() {
	vec3 scaled = v_NormalInterp * 0.5 + vec3(0.5);
	
	vec3 normal = normalize(v_NormalInterp);
	vec3 light_direction = normalize(v_ViewLightTargetPosition - v_ViewLightPosition);
	
	float lambertian = max(dot(-light_direction, normal), 0.0);
	float specular = 0.0;
	if (lambertian > 0.0) {
		// vec3 reflection = reflect(light_direction, normal);
		vec3 viewer = normalize(-v_VertPos);
		vec3 halfway = normalize(-light_direction + viewer);
		specular = pow(max(dot(normal, halfway), 0.0), 70.0);
	}
	
	gl_FragColor = vec4(lambertian * diffuse_color + ambient_color + specular * specular_color, 1.0);
}
`;


class BasicWorldDemo {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this._threejs.domElement);

    window.addEventListener('resize', () => {
      this._OnWindowResize();
    }, false);

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 1000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(75, 20, 0);

    this._scene = new THREE.Scene();

    let light = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    light.position.set(20, 100, 10);
    light.target.position.set(0, 0, 0);
    light.castShadow = true;
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 2048;
    light.shadow.mapSize.height = 2048;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 500.0;
    light.shadow.camera.left = 100;
    light.shadow.camera.right = -100;
    light.shadow.camera.top = 100;
    light.shadow.camera.bottom = -100;
    this._scene.add(light);

	// shows light source and light direction for debugging purposes
	const helper = new THREE.DirectionalLightHelper( light, 5 );
	this._scene.add( helper );

    //create ambient light
	let amblight = new THREE.AmbientLight(0x101010);
	this._scene.add(amblight);

    const controls = new OrbitControls(
      this._camera, this._threejs.domElement);
    controls.target.set(0, 20, 0);
    controls.update();

    const loader = new THREE.CubeTextureLoader();
    const texture = loader.load([
        './resources/posx.jpg',
        './resources/negx.jpg',
        './resources/posy.jpg',
        './resources/negy.jpg',
        './resources/posz.jpg',
        './resources/negz.jpg',
    ]);
    this._scene.background = texture;

    const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100, 10, 10),
        new THREE.MeshStandardMaterial({
            color: 0xFFFFFF,
          }));
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2;
    this._scene.add(plane);

    // const box = new THREE.Mesh(
    //   new THREE.BoxGeometry(2, 2, 2),
    //   new THREE.MeshStandardMaterial({
    //       color: 0xFFFFFF,
    //   }));
    // box.position.set(0, 1, 0);
    // box.castShadow = true;
    // box.receiveShadow = true;
    // this._scene.add(box);

    // for (let x = -8; x < 8; x++) {
    //   for (let y = -8; y < 8; y++) {
    //     const box = new THREE.Mesh(
    //       new THREE.BoxGeometry(2, 2, 2),
    //       new THREE.MeshStandardMaterial({
    //           color: 0x808080,
    //       }));
    //     box.position.set(Math.random() + x * 5, Math.random() * 4.0 + 2.0, Math.random() + y * 5);
    //     box.castShadow = true;
    //     box.receiveShadow = true;
    //     this._scene.add(box);
    //   }
    // }

	// ShaderMaterial declarations
	const gouraud = new THREE.ShaderMaterial({
		uniforms: {
			light_pos: {
				value: light.position
			},
			light_color: {
				value: light.color
			},
			light_target: {
				value: light.target.position
			}
		},
		vertexShader: _GouraudVS,
		fragmentShader: _GouraudFS
	})
	
	const phong = new THREE.ShaderMaterial({
		uniforms: {
			light_pos: {
				value: light.position
			},
			diffuse_color: {
				value: light.color
			},
			light_target: {
				value: light.target.position
			},
			ambient_color: {
				value: amblight.color
			},
			specular_color: {
				value: new THREE.Color(0xffffff)
			}
		},
		vertexShader: _PhongVS,
		fragmentShader: _PhongFS,
	});

	const blinnphong = new THREE.ShaderMaterial({
		uniforms: {
			light_pos: {
				value: light.position
			},
			diffuse_color: {
				value: light.color
			},
			light_target: {
				value: light.target.position
			},
			ambient_color: {
				value: amblight.color
			},
			specular_color: {
				value: new THREE.Color(0xffffff)
			}
		},
		vertexShader: _BPVS,
		fragmentShader: _BPFS,
	});

	// colorful donut, choose from the materials declared above
	const s2 = new THREE.Mesh(
		new THREE.TorusGeometry(10, 3, 16, 100),
		blinnphong
	);
	s2.position.set(0, 20, 0);
	s2.castShadow = true;
	this._scene.add(s2);

    // const box = new THREE.Mesh(
    //   new THREE.SphereGeometry(2, 32, 32),
    //   new THREE.MeshStandardMaterial({
    //       color: 0xFFFFFF,
    //       wireframe: true,
    //       wireframeLinewidth: 4,
    //   }));
    // box.position.set(0, 0, 0);
    // box.castShadow = true;
    // box.receiveShadow = true;
    // this._scene.add(box);

    this._RAF();
  }

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _RAF() {
    requestAnimationFrame(() => {
      this._threejs.render(this._scene, this._camera);
      this._RAF();
    });
  }
}


let _APP = null;

window.addEventListener('DOMContentLoaded', () => {
  _APP = new BasicWorldDemo();
});
