import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { AudioListener, AudioLoader, PositionalAudio } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { CSS3DRenderer, CSS3DObject } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/renderers/CSS3DRenderer.js';
import html2canvas from 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020); // Morado oscuro para el cielo al caer la noche
scene.fog = new THREE.Fog(0x202020, 0, 100); // Similar para la niebla

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';


const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0x93ffff, 2.5);
directionalLight.position.set(25, 25, 25);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add(directionalLight);

const container = document.getElementById('three-container');

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;

container.appendChild(renderer.domElement);


// Crear el renderer CSS3D para el HTML
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssRenderer.domElement.style.position = 'absolute';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.left = '0';
cssRenderer.domElement.style.setProperty('width', '100%', 'important');
cssRenderer.domElement.style.setProperty('height', '100%', 'important');
cssRenderer.domElement.style.pointerEvents = 'none';
cssRenderer.domElement.style.setProperty('z-index', '1000', 'important');
container.appendChild(cssRenderer.domElement);

const GRAVITY = 30;

const NUM_SPHERES = 30;
const SPHERE_RADIUS = 0.5;

const STEPS_PER_FRAME = 5;

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
const enemigos = [];
const mixers = [];
let sphereIdx = 0;
const loaderBala = new GLTFLoader();
const loaderArma = new GLTFLoader();
let armaModel;
let armaTargetPosition = new THREE.Vector3();

// VARIABLES PARA EL JUEGO
let puntaje = 0;
let vida = 100;

let puntajeNivel = 0;
let noEnemigosNivel = 10;

let perdio = false;
let noBalas = 15;

let isAttack = false;
let isPlay = false;

/* SONIDOS */
let shoot = new Audio('./assets/sounds/shoot.mp3');
let music = new Audio('./assets/sounds/music.mp3');

/* VR */
let hand1, hand2;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let fondoVisible = true;

let controls_vr;


function reproducirMusic() {
    music.volume = 0.3; // Ajusta el volumen antes de reproducirlo

    music.loop = true; // Hace que el sonido se repita
    music.play();
}

function estaReproduciendo(audio) {
    return !audio.paused && !audio.ended && audio.currentTime > 0;
}

// Cargar el modelo .glb de la bala
loaderBala.load('./models/gltf/bala.glb', function (gltf) {
    // Al cargar el modelo .glb, lo usamos para crear las balas
    for (let i = 0; i < NUM_SPHERES; i++) {
        // Crear una copia del modelo cargado
        const bullet = SkeletonUtils.clone(gltf.scene) // Clonamos el modelo

        bullet.scale.set(4, 4, 4);

        bullet.traverse((node) => {
            if (node.isMesh) {
                node.material = node.material.clone();
                node.geometry = node.geometry.clone();
                node.castShadow = true;
                node.receiveShadow = true;

                if (node.material.isMeshStandardMaterial || node.material.isMeshPhysicalMaterial) {
                    // Mantiene el color original
                    node.material.emissiveIntensity = 0.3; // más brillo sin cambiar color

                    node.material.roughness = 0.5; // más liso
                    node.material.metalness = 0.3; // más metálico

                    const baseColor = node.material.color.clone();
                    node.material.emissive = baseColor.multiplyScalar(0.1); // una pequeña emisión del color original
                }
            }
        });

        // Añadir la bala a la escena
        scene.add(bullet);

        // Agregar la bala al array de esferas (spheres)
        spheres.push({
            mesh: bullet,
            collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), SPHERE_RADIUS), // Usamos un collider esférico para la bala
            velocity: new THREE.Vector3(), // Velocidad inicial de la bala
            isOnGround: false // Atributo para saber si está en el suelo
        });
    }
}, undefined, function (error) {
    console.error(error); // Si hay algún error al cargar el modelo
});

// Cargar el modelo .glb del arma
loaderArma.load('./models/gltf/arma.glb', function (gltf) {
    armaModel = gltf.scene;
    armaModel.scale.set(0.6, 0.6, 0.6); // Ajusta según tamaño real del modelo

    // Posición inicial (parte inferior derecha de la vista de la cámara)
    const offsetInicial = new THREE.Vector3(0.4, -0.3, -0.7); // Derecha, abajo, hacia adelante
    const initialPosition = camera.position.clone().add(offsetInicial.applyQuaternion(camera.quaternion));
    armaModel.position.copy(initialPosition);

    // Posición destino (centro de pantalla, justo al frente)
    const offsetCentro = new THREE.Vector3(0, -0.1, -0.5);
    armaTargetPosition.copy(camera.position.clone().add(offsetCentro.applyQuaternion(camera.quaternion)));

    scene.add(armaModel);

}, undefined, function (error) {
    console.error(error);
});


const worldOctree = new Octree();

const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

let minMap, sizeMap;

document.addEventListener('keydown', (event) => {

    keyStates[event.code] = true;

});

document.addEventListener('keyup', (event) => {

    keyStates[event.code] = false;

});

document.addEventListener('mouseup', () => {

    if (document.pointerLockElement !== null) throwBall();

});

document.body.addEventListener('mousemove', (event) => {

    if (document.pointerLockElement === document.body) {

        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;

    }

});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function throwBall() {

    if (vida <= 0 || perdio) {
        return;
    }

    if (noBalas <= 0) {
        return;
    }

    if (!isPlay) {
        return;
    }

    const sphere = spheres[sphereIdx];

    const punta = armaModel.getObjectByName('puntaArma');
    const puntaPos = new THREE.Vector3();
    punta.getWorldPosition(puntaPos);

    const target_ = new THREE.Vector3();
    mira.getWorldPosition(target_);

    const playerDirection = new THREE.Vector3().subVectors(target_, puntaPos).normalize();

    const posicionInicial = puntaPos.clone(); // Esto es lo que usarás como punto inicial del disparo
    sphere.collider.center.copy(posicionInicial);

    sphere.isOnGround = false;

    if (!scene.children.includes(sphere.mesh)) {
        scene.add(sphere.mesh)
    }

    // Obtener posición objetivo en la dirección del jugador
    const target = new THREE.Vector3().copy(sphere.mesh.position).add(playerDirection);

    // Hacer que la malla mire hacia la dirección del jugador
    sphere.mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(sphere.mesh.position, target, new THREE.Vector3(0, -1, 0))
    );

    // Ajustar rotación inicial del modelo si apunta en otra dirección originalmente
    sphere.mesh.rotateY(-Math.PI / 2);  // Por ejemplo, si tu modelo apunta en el eje Y

    // throw the ball with more force if we hold the button longer, and if we move forward
    const impulse = 80 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    shoot.currentTime = 0;  // Reinicia el sonido si no se está reproduciendo
    shoot.volume = 0.2;
    shoot.play();

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    sphere.startPosition = posicionInicial.clone();

    sphereIdx = (sphereIdx + 1) % spheres.length;

    noBalas--;

    let txt = noBalas.toString().padStart(2, ' ');
    document.getElementById('noBalas').innerHTML = 'Munición ' + txt + '/15'
    actualizarBarraMunicion();
}

function playerCollisions() {

    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {

        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {

            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));

        }

        if (result.depth >= 1e-10) {

            playerCollider.translate(result.normal.multiplyScalar(result.depth));

        }

    }

}

function updatePlayer(deltaTime) {

    let damping = Math.exp(- 4 * deltaTime) - 1;

    if (!playerOnFloor) {

        playerVelocity.y -= GRAVITY * deltaTime;

        // small air resistance
        damping *= 0.1;

    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();
    posArma();

    camera.position.copy(playerCollider.end);
    player.position.copy(playerCollider.end.clone().add(new THREE.Vector3(0, -0.5, 0)));

    directionalLight.position.copy(playerCollider.end).add(new THREE.Vector3(25, 100, 25));
    directionalLight.target.position.copy(playerCollider.end);
    directionalLight.target.updateMatrixWorld();
}

function playerSphereCollision(sphere) {

    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);

    const sphere_center = sphere.collider.center;

    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    // approximation: player = 3 spheres

    for (const point of [playerCollider.start, playerCollider.end, center]) {

        const d2 = point.distanceToSquared(sphere_center);

        if (d2 < r2) {

            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            sphere_center.addScaledVector(normal, - d);

        }

    }

}

function spheresCollisions() {

    for (let i = 0, length = spheres.length; i < length; i++) {

        const s1 = spheres[i];

        for (let j = i + 1; j < length; j++) {

            const s2 = spheres[j];

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {

                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;

                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, - d);

            }

        }

    }

}

// Verifica si alguna esfera golpea a algún enemigo
function enemyCoalition() {
    for (let i = spheres.length - 1; i >= 0; i--) {
        const esfera = spheres[i];
        if (esfera.isOnGround) continue;

        for (let j = 0; j < enemigos.length; j++) {
            const enemigo = enemigos[j];

            const dx = esfera.collider.center.x - enemigo.collider.center.x;
            const dy = esfera.collider.center.y - enemigo.collider.center.y;
            const dz = esfera.collider.center.z - enemigo.collider.center.z;

            const rx = 0.65;  // ancho (X)
            const ry = 2.47;  // alto (Y), ajustable según tamaño del enemigo
            const rz = 0.65; // largo (Z)

            const elipsoide = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);

            if (elipsoide < 1) {
                enemigo.dead = true;
                scene.remove(esfera.mesh);
                break;
            }
        }
    }
}


function enemyCollisions(enemigo) {
    // Tomar los valores del objeto enemigo
    const x = enemigo.collider.center.x;        // Posición en X
    const y = enemigo.collider.center.y + 2;    // Posición en Y
    const z = enemigo.collider.center.z;        // Posición en Z

    const radio = 0.9;  // Tamaño en radio para la esfera

    // Crear una esfera con la posición y radio del enemigo
    const esferaCollider = new THREE.Sphere(new THREE.Vector3(x, y, z), radio);

    // Usar el método sphereIntersect para verificar si la esfera colisiona con alguna pared
    const result = worldOctree.sphereIntersect(esferaCollider);

    if (result) {
        // Opción para mover al enemigo fuera de la colisión, si es necesario
        enemigo.collider.center.addScaledVector(result.normal, result.depth);
        return true;  // Retorna true si se detectó la colisión
    }

    // Retorna false si no se detectó colisión
    return false;
}

function updateSpheres(deltaTime) {

    spheres.forEach(sphere => {

        if (!sphere.startPosition) return;

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);
        const distanciaRecorrida = sphere.collider.center.distanceTo(sphere.startPosition);
        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {

            // Detenemos la velocidad completamente en las direcciones x y z
            sphere.velocity.x = 0;
            sphere.velocity.z = 0;

            // Solo mantenemos la componente y de la velocidad para que pueda caer hacia el suelo
            // Movemos la esfera fuera de la colisión
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));

            // Si la colisión es en la pared, comenzamos a aplicar la gravedad
            // De lo contrario, la velocidad y se ajusta con la gravedad
            if (result.normal.y < 0.5) {
                sphere.velocity.y = -Math.abs(sphere.velocity.y); // Empieza a caer hacia el suelo

                sphere.isOnGround = true // Atributo para saber si está en el suelo
            }

        } else {

            sphere.velocity.y -= GRAVITY * deltaTime;

            //sphere.velocity.y -= deltaTime;
        }

        const damping = Math.exp(- 1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

        //playerSphereCollision(sphere);

    });

    //spheresCollisions();
    enemyCoalition();

    for (const sphere of spheres) {

        sphere.mesh.position.copy(sphere.collider.center);

    }

}

function getForwardVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);

    return playerDirection;

}

function controls(deltaTime) {

    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {

        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));

    }

    if (keyStates['KeyS']) {

        playerVelocity.add(getForwardVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyA']) {

        playerVelocity.add(getSideVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyD']) {

        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));

    }

    if (playerOnFloor) {

        if (keyStates['Space']) {

            playerVelocity.y = 10;

        }

    }

    // Movimiento con joystick
    detectarJoystick(deltaTime);

}

const loader = new GLTFLoader().setPath('./models/gltf/');
const loaderEne = new GLTFLoader();

const modeloRuta = './models/gltf/Zombi.glb';
let modeloBase = null;
let modeloAnimations = [];

const listener = new THREE.AudioListener();
const audioLoader = new THREE.AudioLoader();

// Cargar mapa
loader.load('Mapa_op.glb', (gltf) => {
    document.getElementById('spinner').classList.add('hidden');
    document.getElementById('txtSpinner').classList.add('hidden');
    agregarBoton();

    const mapa = gltf.scene;
    mapa.scale.set(0.7, 0.7, 0.7);

    scene.add(mapa);
    worldOctree.fromGraphNode(mapa);

    gltf.scene.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material.map) {
                child.material.map.anisotropy = 4;
            }
        }
    });

    const box = new THREE.Box3().setFromObject(mapa);
    const size = new THREE.Vector3();
    box.getSize(size);
    const min = box.min;

    minMap = min;
    sizeMap = size;

    // Aquí ya está cargado el mapa. Ahora carga el modelo de enemigo.
    loaderEne.load(modeloRuta, (gltfEnemy) => {
        modeloBase = gltfEnemy.scene;
        modeloAnimations = gltfEnemy.animations;
        // Ya se puede colocar porque el mapa existe
        colocarEnemigos(min, size, 150);

    });

});

// Función para colocar enemigos
let walkBuffer = null;
let attackBuffer = null;
let deadBuffer = null;

audioLoader.load('./assets/sounds/Zombie.mp3', buffer => walkBuffer = buffer);
audioLoader.load('./assets/sounds/zombi_attack.mp3', buffer => attackBuffer = buffer);
audioLoader.load('./assets/sounds/zombie_dead.mp3', buffer => deadBuffer = buffer);

function colocarEnemigos(min, size, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        if (modeloBase && walkBuffer && attackBuffer && deadBuffer) {
            const clon = SkeletonUtils.clone(modeloBase);

            const audioWalk = new THREE.PositionalAudio(listener);
            audioWalk.setBuffer(walkBuffer);
            audioWalk.setRefDistance(5);
            audioWalk.setLoop(true);
            audioWalk.setVolume(0);
            audioWalk.setMaxDistance(30);
            audioWalk.setDistanceModel('linear');
            audioWalk.play();
            clon.audioWalk = audioWalk;

            const audioAttack = new THREE.PositionalAudio(listener);
            audioAttack.setBuffer(attackBuffer);
            audioAttack.setRefDistance(1);
            audioAttack.setLoop(true);
            audioAttack.setVolume(1.5);
            audioAttack.setMaxDistance(5);
            audioAttack.setDistanceModel('linear');
            clon.audioAttack = audioAttack;

            const audioDead = new THREE.PositionalAudio(listener);
            audioDead.setBuffer(deadBuffer);
            audioDead.setRefDistance(1);
            audioDead.setLoop(false);
            audioDead.setVolume(2);
            audioDead.setMaxDistance(30);
            audioDead.setDistanceModel('linear');
            clon.audioDead = audioDead;

            clon.traverse((node) => {
                if (node.isMesh) {
                    node.material = node.material.clone();
                    node.geometry = node.geometry.clone();
                    node.castShadow = true;
                    node.receiveShadow = true;

                    node.add(audioWalk);
                    node.add(audioAttack);
                    node.add(audioDead);

                    if (node.material.isMeshStandardMaterial || node.material.isMeshPhysicalMaterial) {
                        node.material.emissiveIntensity = 1;
                        node.material.roughness = 0.8;
                        node.material.metalness = 0.5;
                        const baseColor = node.material.color.clone();
                        node.material.emissive = baseColor.multiplyScalar(0.01);
                    }
                }
            });

            const x = min.x + Math.random() * size.x;
            const z = min.z + Math.random() * size.z;
            clon.position.set(x, 0.1, z);
            clon.scale.set(1.3, 1.3, 1.3);

            const mixer = new THREE.AnimationMixer(clon);
            const actions = {
                Walk: mixer.clipAction(THREE.AnimationClip.findByName(modeloAnimations, 'WALK')),
                Attack: mixer.clipAction(THREE.AnimationClip.findByName(modeloAnimations, 'ATTACK')),
                Dying: mixer.clipAction(THREE.AnimationClip.findByName(modeloAnimations, 'DYNING'))
            };

            if (actions.Walk) {
                actions.Walk.setLoop(THREE.LoopRepeat, Infinity);
                actions.Walk.timeScale = 2;
                actions.Walk.play();
            }

            mixers.push(mixer);
            clon.userData = { actions };
            clon.dead = false;

            scene.add(clon);

            clon.collider = {
                center: clon.position.clone(),
                radius: 5,
            };

            enemigos.push({
                mesh: clon,
                collider: new THREE.Sphere(clon.position.clone(), 5),
            });

        } else {
            console.warn('Faltan modeloBase o buffers de sonido.');
        }
    }
}

function teleportPlayerIfOob() {

    if (camera.position.y <= - 20) {

        playerCollider.start.set(0, 0.5, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.5;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);

    }

}

function isAnimating(acciones) {
    return Object.values(acciones).every(action => !action.isRunning());
}

function nuevaPosicion(enemy) {
    // Generamos las posiciones aleatorias
    const x = minMap.x + Math.random() * sizeMap.x;
    const z = minMap.z + Math.random() * sizeMap.z;

    // Establecemos la posición en las coordenadas calculadas
    enemy.position.set(x, 0.1, z);
}

// Función que actualiza la posición y orientación del arma
//const clock1 = new THREE.Clock();

function posArma() {
    if (!armaModel) return;

    // Base: posición del jugador
    const basePos = playerCollider.end.clone();

    // Offset relativo a la cámara
    const offset = new THREE.Vector3(0.7, 0.6, -0.7); // abajo, derecha y al frente
    const offsetMundial = offset.applyQuaternion(player.quaternion);

    // Posición final sin interpolación
    // Espera 1000 milisegundos (1 segundo) antes de actualizar la posición
    setTimeout(() => {
        armaModel.position.copy(basePos.add(offsetMundial));
    }, 0.05); // 1000 milisegundos

    // Rotación = igual a la de la cámara
    //armaModel.quaternion.copy(mira.quaternion);

    // Hacer que la punta del arma mire hacia la mira
    armaModel.lookAt(mira.getWorldPosition(new THREE.Vector3()));

    // Ajuste diagonal
    armaModel.rotateX(0.2); // menor ajuste, prueba con valores pequeños
    armaModel.rotateY(Math.PI / 2);
    armaModel.rotateZ(-Math.PI / 8);
}

function crearCruz() {
    const material = new THREE.LineBasicMaterial({ color: 0xbd0505 });
    const size = 0.3;

    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0),
        new THREE.Vector3(0, -size, 0), new THREE.Vector3(0, size, 0),
    ]);

    const cruz = new THREE.LineSegments(geometry, material);
    scene.add(cruz);
    return cruz;
}

const mira = crearCruz();

function animate() {
    const delta = clock.getDelta();
    const deltaTime = Math.min(0.05, delta) / STEPS_PER_FRAME;

    if (vida <= 0 || perdio) {
        renderer.setAnimationLoop(null);
        txtGameOver();

        // Salir de modo VR
        const session = renderer.xr.getSession();
        if (session) {
            session.end();
        }

        clearInterval(intervaBalaslId);
        document.exitPointerLock();
        container.removeEventListener('mousedown', handleMouseDown);

        enemigos.forEach(enemigo => {

            if (enemigo.mesh.audioWalk.isPlaying) {
                enemigo.mesh.audioWalk.setVolume(0);
                enemigo.mesh.audioWalk.stop();
            }

            if (enemigo.mesh.audioAttack.isPlaying) {
                enemigo.mesh.audioAttack.setVolume(0);
                enemigo.mesh.audioAttack.stop();
            }

            if (enemigo.mesh.audioDead.isPlaying) {
                enemigo.mesh.audioDead.setVolume(0);
                enemigo.mesh.audioDead.stop();
            }

        });

        if (esPuntajeAlto(puntaje)) {
            mostrarModalRegistro();
        }
    }

    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection.

    for (let i = 0; i < STEPS_PER_FRAME; i++) {

        controls(deltaTime);

        updatePlayer(deltaTime);

        updateSpheres(deltaTime);

        teleportPlayerIfOob();

        // Obtener la dirección del controlador
        const camDir = new THREE.Vector3();
        controller2.getWorldDirection(camDir);

        // Obtener la posición global de la cámara
        const camPos = new THREE.Vector3();
        player.getWorldPosition(camPos);

        // Calcular posición deseada de la mira, relativa al controlador pero con offset desde la cámara
        const miraPos = new THREE.Vector3().copy(camDir).multiplyScalar(-10); // alejar desde controlador
        miraPos.y -= -1.7; // opcional: ajuste vertical
        miraPos.add(camPos); // sumar la posición de la cámara (eje de referencia central)

        // Posicionar la mira
        mira.position.copy(miraPos);

        // Hacer que la mira apunte a la cámara (eje central)
        mira.lookAt(camPos);

    }

    // Actualizar la posición de los enemigos
    const velocidadZombie = 0.02;
    isAttack = false;

    enemigos.forEach((enemigo) => {
        const direccion = new THREE.Vector3();
        direccion.subVectors(armaModel.position, enemigo.mesh.position);  // Direccion hacia el jugador
        const distancia = direccion.length();
        const acciones = enemigo.mesh.userData.actions;

        // Si el enemigo choca con una pared se genera en una nueva posición
        if (enemyCollisions(enemigo, deltaTime)) {
            nuevaPosicion(enemigo.mesh)
        }

        if (enemigo.dead && isAnimating(acciones)) {
            //console.log('Bug')
            acciones.Dying.reset();
            acciones.Dying.play();
            acciones.Dying.stop();

            nuevaPosicion(enemigo.mesh)

            enemigo.dead = false
            return;
        }

        if (enemigo.dead) {
            const clipDuracion = acciones.Dying.getClip().duration;
            //const timeScale = acciones.Dying.timeScale || 1;
            const tiempoActual = acciones.Dying.time;

            if (acciones && !acciones.Dying.isRunning() && !isAnimating(acciones)) {

                if (acciones.Walk.isRunning()) {
                    acciones.Walk.stop();
                } else {
                    acciones.Attack.stop();
                }

                if (enemigo.mesh.audioWalk.isPlaying) {
                    enemigo.mesh.audioWalk.stop();
                }

                if (enemigo.mesh.audioAttack.isPlaying) {
                    enemigo.mesh.audioAttack.stop();
                }

                if (!enemigo.mesh.audioDead.isPlaying) {
                    enemigo.mesh.audioDead.stop();
                    enemigo.mesh.audioDead.play();
                }

                acciones.Dying.reset();
                acciones.Dying.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Dying.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Dying.timeScale = 2;
                acciones.Dying.play();

                puntaje++;
                puntajeNivel++;

                document.getElementById('puntObje').innerHTML = puntajeNivel;
                document.getElementById('puntTotal').innerHTML = puntaje;

                marcadorUI.userData.izq.userData.actualizarTexto(puntajeNivel);
                marcadorUI.userData.der.userData.actualizarTexto(puntaje);
                //console.log(puntaje)
            }

            if (tiempoActual >= clipDuracion) {
                acciones.Dying.reset();
                acciones.Dying.play();
                acciones.Dying.stop();

                nuevaPosicion(enemigo.mesh)

                enemigo.dead = false
            }

            return;
        }

        if (distancia > 20 && !enemigo.dead) {
            if (enemigo.mesh.audioWalk.isPlaying) {
                enemigo.mesh.audioWalk.stop();
            }
        }

        if (distancia > 3 && !enemigo.dead) {
            direccion.normalize();  // Normalizamos la dirección para no movernos más rápido en diagonal

            // Actualizar la posición del enemigo
            enemigo.mesh.position.x += direccion.x * velocidadZombie;
            enemigo.mesh.position.z += direccion.z * velocidadZombie;

            // Asegurarse de que el enemigo siempre esté cerca del suelo
            enemigo.mesh.position.y = 0.1;

            // Actualizar collider
            enemigo.collider.center.copy(enemigo.mesh.position);

            // Calcular la rotación del enemigo hacia el jugador
            const angulo = Math.atan2(direccion.x, direccion.z);  // Calculamos el ángulo en radianes
            enemigo.mesh.rotation.y = angulo;  // Aplicamos la rotación en el eje Y

            if (acciones && (acciones.Attack.isRunning() || isAnimating(acciones))) {
                acciones.Attack.stop();        // Detén WALK si está activa
                acciones.Walk.reset();
                acciones.Walk.setLoop(THREE.LoopRepeat, Infinity);  // Repetir indefinidamente
                acciones.Walk.timeScale = 2;
                acciones.Walk.play();

                if (enemigo.mesh.audioAttack.isPlaying) {
                    enemigo.mesh.audioAttack.stop();
                }
            }

            if (!enemigo.mesh.audioWalk.isPlaying && distancia <= 20) {
                enemigo.mesh.audioWalk.play();
            }

        } else {

            const clipDuracion = acciones.Attack.getClip().duration;
            const tiempoActual = acciones.Attack.time;
            isAttack = true;

            // Calcular la rotación del enemigo hacia el jugador
            const angulo = Math.atan2(direccion.x, direccion.z);  // Calculamos el ángulo en radianes
            enemigo.mesh.rotation.y = angulo;  // Aplicamos la rotación en el eje Y

            if (acciones && !acciones.Attack.isRunning() && !isAnimating(acciones)) {

                if (acciones.Walk.isRunning()) {
                    acciones.Walk.stop();
                }

                acciones.Attack.reset();
                acciones.Attack.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Attack.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Attack.timeScale = 2;
                acciones.Attack.play();

                if (enemigo.mesh.audioWalk.isPlaying) {
                    enemigo.mesh.audioWalk.stop();
                }

                if (!enemigo.mesh.audioAttack.isPlaying) {
                    enemigo.mesh.audioAttack.stop();
                    enemigo.mesh.audioAttack.play();
                }
            }

            if (tiempoActual >= clipDuracion) {
                acciones.Attack.reset();
                acciones.Attack.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Attack.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Attack.timeScale = 2;
                acciones.Attack.play();

                vida -= 10;

                let fuerzaTexto = vida.toString().padStart(3, ' ');
                document.getElementById('fuerza').innerHTML = 'Fuerza ' + fuerzaTexto + '/100';
                actualizarBarraVida();
            }
        }
    });

    if (isAttack) {
        if (!fondoVisible) {
            fondoVisible = true;
            document.getElementById('three-container').classList.add('show-border');

            fondo.material.opacity = 0;  // Empieza invisible
            camera.add(fondo);           // Lo agregas al padre (cámara)

            gsap.to(fondo.material, {
                opacity: 1,
                duration: 0.5,
                ease: 'power2.inOut'
            });
        }
    } else {
        if (fondoVisible) {
            fondoVisible = false;
            document.getElementById('three-container').classList.remove('show-border');

            gsap.to(fondo.material, {
                opacity: 0,
                duration: 1.5,
                ease: 'power2.inOut',
                onComplete: () => {
                    if (fondo.parent) {
                        fondo.parent.remove(fondo);
                    }
                }
            });
        }
    }

    // Actualizar animaciones
    mixers.forEach(mixer => mixer.update(delta));

    renderer.render(scene, camera);
}

// Función que se ejecuta cada minuto
function incrementaNivel() {
    //Cada nivel aumenta dos enemigos más para matar
    if (noEnemigosNivel > puntajeNivel) {
        perdio = false;
    }

    noEnemigosNivel += 2;
    puntajeNivel = 0;

    if (document.getElementById('puntObje')) {
        document.getElementById('puntObje').innerHTML = puntajeNivel;
        marcadorUI.userData.izq.userData.actualizarTexto(puntajeNivel);
    }
}

function incrementaBalas() {
    //Cada nivel aumenta dos enemigos más para matar
    if (noBalas < 15)
        noBalas++;

    let txt = noBalas.toString().padStart(2, ' ');
    document.getElementById('noBalas').innerHTML = 'Munición ' + txt + '/15'
    actualizarBarraMunicion();
}

const intervaBalaslId = setInterval(incrementaBalas, 1500);

async function init() {
    controls_vr = new OrbitControls(camera, container);
    controls_vr.target.set(0, 0, 0);
    controls_vr.update();

    const sessionInit = {
        requiredFeatures: ['hand-tracking']
    };

    //document.body.appendChild(VRButton.createButton(renderer, sessionInit));

    // Inicia la sesión VR de forma automatica
    const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
    });

    renderer.xr.setSession(session);

    // controllers
    controller1 = renderer.xr.getController(0);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('selectend', onSelectEnd);

    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('selectend', onSelectEnd);

    // Hand 1
    /*controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);

    hand1 = renderer.xr.getHand(0);
    hand1.add(handModelFactory.createHandModel(hand1));

    scene.add(hand1);*/

    // Hand 2
    /*controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);

    hand2 = renderer.xr.getHand(1);
    hand2.add(handModelFactory.createHandModel(hand2));
    scene.add(hand2);*/

    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, - 1)]);

}

const player = new THREE.Group();
player.add(camera); // añade la cámara al grupo
scene.add(player);
player.add(listener);

function onSelectStart(event) {
    const controller = event.target;

    throwBall();
}

function onSelectEnd(event) {

}

function txtGameOver() {
    // Limpiar el contenido previo del contenedor
    const threeContainer = document.getElementById('three-container');
    threeContainer.innerHTML = '';  // Borra todo el contenido actual

    // Crear el contenedor principal
    const loadingMessage = document.createElement('div');
    loadingMessage.id = 'loadingMessage';

    // Crear y agregar el título
    const title = document.createElement('h1');
    title.classList.add('game-title');
    title.textContent = 'Game Over';
    loadingMessage.appendChild(title);

    // Agregar el mensaje al contenedor
    threeContainer.appendChild(loadingMessage);

    // Llamar a la función para agregar el botón
    agregarBoton('JUGAR DE NUEVO', 1);
}

function agregarBoton(txt = 'JUGAR AHORA', opc = 0) {
    // Crear el contenedor <span>
    const span = document.createElement('span');

    // Crear el contenedor <div> con id 'btnControl' y la clase 'containerBtn'
    const btnControl = document.createElement('div');
    btnControl.id = 'btnControl';
    btnControl.classList.add('containerBtn');

    // Crear el enlace <a> con la clase 'button' y 'type--C'
    const buttonLink = document.createElement('a');
    buttonLink.href = '#';
    buttonLink.classList.add('button', 'type--C');

    // Crear el texto dentro del botón
    const buttonText = document.createElement('span');
    buttonText.classList.add('button__text');
    buttonText.textContent = txt;

    // Agregar el texto al botón
    buttonLink.appendChild(buttonText);

    // Agregar el enlace al contenedor <div>
    btnControl.appendChild(buttonLink);

    // Agregar el contenedor <div> al contenedor <span>
    span.appendChild(btnControl);

    // Obtener el contenedor de carga por su ID y agregarle el <span>
    const loadingMessage = document.getElementById('loadingMessage');
    loadingMessage.appendChild(span);

    // Agregar el evento de clic al botón
    buttonLink.addEventListener('click', function (event) {
        event.preventDefault();  // Prevenir la acción predeterminada del enlace (si es necesario)

        if (opc == 0) {
            renderer.setAnimationLoop(animate);
            isPlay = true;

            if (!estaReproduciendo(music)) {
                reproducirMusic();
            }

            enemigos.forEach(enemigo => {
                const audio = enemigo.mesh.audioWalk;
                if (audio) {
                    audio.setVolume(2);
                }
            });

            document.getElementById('loadingMessage').classList.add('hidden');

            document.body.requestPointerLock();
            container.addEventListener('mousedown', handleMouseDown);

            /*iniciarTemporizador(texto => {
                if (marcadorUI?.userData?.centro?.userData?.actualizarTexto) {
                    marcadorUI.userData.centro.userData.actualizarTexto(texto);
                    marcadorUI.userData.centro.material.map.needsUpdate = true;
                    marcadorUI.userData.centro.material.needsUpdate = true;
                    marcadorUI.userData.centro.frustumCulled = false;
                }
            });*/

            mostrarAlerta();
            init();
        } else {
            location.reload();
            console.log("entro");
        }
    });
}

function handleMouseDown() {
    document.body.requestPointerLock();
    mouseTime = performance.now();
}

let ultimoTexto = '';

function iniciarTemporizador(callbackActualizarTexto) {
    const timeElement = document.getElementById('time');
    let tiempoInicio = Date.now();
    let duracionSegundos = 60;

    function actualizar() {
        const tiempoActual = Date.now();
        const tiempoTranscurrido = tiempoActual - tiempoInicio;
        const tiempoRestante = Math.max(0, duracionSegundos * 1000 - tiempoTranscurrido);

        const segundosRestantes = Math.floor(tiempoRestante / 1000);
        const minutos = Math.floor(segundosRestantes / 60).toString().padStart(2, '0');
        const segundos = (segundosRestantes % 60).toString().padStart(2, '0');

        const texto = `${minutos}:${segundos}`;

        // Actualiza el DOM si existe
        if (timeElement) {
            timeElement.textContent = texto;
        }

        // Si hay un callback externo, lo llama con el texto
        if (texto !== ultimoTexto) {
            ultimoTexto = texto;

            if (timeElement) {
                timeElement.textContent = texto;
            }

            if (typeof callbackActualizarTexto === 'function') {
                callbackActualizarTexto(texto);
                scene.add(marcadorUI.userData.centro);
            }
        }

        // Cuando se cumple exactamente un ciclo completo
        if (tiempoTranscurrido >= duracionSegundos * 1000) {
            incrementaNivel();
            if (vida > 0 && !perdio) {
                mostrarAlerta();
            }

            tiempoInicio = Date.now(); // Reinicia el tiempo
        }

        requestAnimationFrame(actualizar);
    }

    actualizar();
}


function actualizarBarraMunicion() {
    const porcentajeMunicion = (noBalas / 15) * 100;
    const barraMunicion = document.getElementById('progressBarBullets');
    barraMunicion.style.setProperty('width', porcentajeMunicion + '%', 'important');

    barraMunicion_vr.setValor(porcentajeMunicion);

    // Actualizar el texto que muestra la munición
    document.getElementById('noBalas').innerHTML = `Munición ${noBalas}/15`;
}

function actualizarBarraVida() {
    const porcentajeVida = (vida / 100) * 100; // Supongo que la vida máxima es 100
    const barraVida = document.getElementById('progressBarVida');
    barraVida.style.setProperty('width', porcentajeVida + '%', 'important');

    barraFuerza_vr.setValor(porcentajeVida);

    // Actualizar el texto que muestra la vida
    document.getElementById('fuerza').innerHTML = `Fuerza ${vida}/100`;
}

function mostrarAlerta() {
    const alerta = document.getElementById('modalAlerta');
    document.getElementById('txtDescript').innerHTML = 'Debes de terminar con ' + noEnemigosNivel + ' zombies';
    alerta.classList.add('mostrar'); // Muestra la alerta añadiendo la clase

    //crearAlertaMision('Debes de terminar con ' + noEnemigosNivel + ' zombies')

    setTimeout(() => {
        alerta.classList.remove('mostrar'); // La oculta después de 3 segundos
    }, 3000);
}

/* CODIFICACIÓN DE LOS PUNTAJES MÁS ALTOS */

// Cargar puntajes desde localStorage
function cargarPuntajes() {
    const puntajes = JSON.parse(localStorage.getItem('highScores'));
    return puntajes || []; // Si no hay puntajes, devuelve un array vacío
}

// Guardar puntajes en localStorage
function guardarPuntajes(puntajes) {
    localStorage.setItem('highScores', JSON.stringify(puntajes));
}

// Agregar nuevo puntaje si es récord y evitar duplicados
function agregarPuntaje(nombre, puntaje) {
    let puntajes = cargarPuntajes(); // Cargar puntajes actuales desde localStorage

    // Verificar si el puntaje ya existe para el mismo nombre
    const existePuntaje = puntajes.find(p => p.nombre === nombre);

    if (existePuntaje) {
        // Si el puntaje existente es mayor que el nuevo, no hacemos nada
        if (existePuntaje.puntaje >= puntaje) {
            console.log(`${nombre} ya tiene un puntaje mayor o igual.`);
            return;
        }
        // Si el puntaje existente es menor, lo actualizamos
        existePuntaje.puntaje = puntaje;
    } else {
        // Si no existe, agregamos un nuevo puntaje
        puntajes.push({ nombre, puntaje });
    }

    // Ordenar los puntajes de mayor a menor
    puntajes.sort((a, b) => b.puntaje - a.puntaje);

    // Mantener solo los 5 más altos
    puntajes = puntajes.slice(0, 5);

    // Guardar en el localStorage
    guardarPuntajes(puntajes);

    console.log('Puntajes actualizados:', puntajes);
}

function esPuntajeAlto(puntaje) {
    const puntajes = cargarPuntajes(); // Cargar los puntajes actuales

    // Si hay menos de 5 puntajes, automáticamente entra
    if (puntajes.length < 5) {
        return true;
    }

    // Obtener el puntaje más bajo en la lista actual
    const puntajeMasBajo = puntajes[puntajes.length - 1].puntaje;

    // Si el nuevo puntaje es mayor que el más bajo, entra en el top 5
    return puntaje > puntajeMasBajo;
}

// Función para mostrar los puntajes en el modal
function mostrarPuntajes() {
    const puntajes = cargarPuntajes(); // Cargar puntajes actuales desde localStorage
    const modalBody = document.getElementById('modalPuntajesBody'); // Obtener el cuerpo del modal

    if (puntajes.length === 0) {
        modalBody.innerHTML = '<p class="text-center">No hay puntajes guardados.</p>'; // Mostrar mensaje si no hay puntajes
    } else {
        let html = '<div class="list-group">';
        puntajes.forEach(p => {
            html += `
          <div class="list-group-item d-flex justify-content-between align-items-center">
            <strong>${p.nombre}</strong>
            <span class="badge bg-primary rounded-pill">${p.puntaje}</span>
          </div>
        `; // Agregar cada puntaje a la lista con estilo
        });
        html += '</div>';
        modalBody.innerHTML = html; // Insertar los puntajes en el modal
    }
}

// Función para mostrar el modal cuando el puntaje entra en el Top 5
function mostrarModalRegistro() {
    const modal = document.getElementById('modalRegistroPuntaje');
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
}

// Función para guardar el puntaje ingresado
function guardarNuevoPuntaje() {
    const nombre = document.getElementById('nombreJugador').value.trim();

    if (nombre === '') {
        alert('Por favor, ingresa tu nombre.');
        return;
    }

    agregarPuntaje(nombre, puntaje); // Guardar el puntaje en localStorage

    // Cerrar el modal
    const modal = document.getElementById('modalRegistroPuntaje');
    const bootstrapModal = bootstrap.Modal.getInstance(modal);
    bootstrapModal.hide();
}

window.onload = () => {
    mostrarPuntajes();

    const boton = document.getElementById('btnPuntaje');
    boton.addEventListener('click', guardarNuevoPuntaje);

};


function detectarJoystick(deltaTime) {

    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    const session = renderer.xr.getSession();
    if (!session) {
        console.log("No hay sesión XR activa");
        return;
    }

    for (const source of session.inputSources) {
        //console.log("InputSource:", source);

        if (source.gamepad) {
            //console.log("Gamepad detectado", source.handedness);
            const axes = source.gamepad.axes;
            const x = axes[2];
            const y = axes[3];
            //console.log(`Axes: ${axes}`);

            // Mostrar si hay movimiento real
            if (Math.abs(x) > 0.05 || Math.abs(y) > 0.05) {
                //console.log(`Joystick ${source.handedness} movido: x=${x}, y=${y}`);

                // Movimiento hacia adelante y atrás
                playerVelocity.add(getForwardVector().multiplyScalar(-y * speedDelta));

                // Movimiento lateral (izquierda/derecha)
                playerVelocity.add(getSideVector().multiplyScalar(x * speedDelta));

                /*controls_vr.target.set(playerCollider.end);
                controls_vr.update();*/

            }

        } else {
            console.log("InputSource sin gamepad:", source);
        }
    }
}


/* ETIQUETAS DE INFORMACION */

// Función para crear solo texto blanco (sin fondo)
function crearTextoPlano(texto, ancho = 1.2, alto = 0.6) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d', { alpha: true });

    function dibujarTexto(t) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 40px Poppins';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t, canvas.width / 2, canvas.height / 2);
    }

    dibujarTexto(texto);

    const texture = new THREE.CanvasTexture(canvas);
    texture.dynamic = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    material.map = texture;
    material.needsUpdate = true;


    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ancho, alto), material);
    mesh.frustumCulled = false;

    // Permitir actualización del texto
    mesh.userData.dibujarTexto = dibujarTexto;
    mesh.userData.texture = texture;

    mesh.userData.actualizarTexto = function (nuevoTexto) {
        if (mesh.userData.textoActual !== nuevoTexto) {
            mesh.userData.dibujarTexto(nuevoTexto);

            // Forzar repintado visual en VR
            mesh.userData.texture.needsUpdate = true;
            mesh.material.map.needsUpdate = true;
            mesh.material.needsUpdate = true;

            // Opcionalmente, marcar que se salga del frustum para que se redibuje
            mesh.frustumCulled = false;

            // Marca el texto como actualizado
            mesh.userData.textoActual = nuevoTexto;
        }
    };

    return mesh;
}

// Función para crear un rectángulo con texto
function crearRectanguloConTexto(texto, colorFondo, colorBordeIzq, colorBordeDer) {
    const group = new THREE.Group();

    const anchoTotal = 1.5;
    const alto = 0.5;
    const anchoBorde = 0.05;

    // Fondo
    const fondo = new THREE.Mesh(
        new THREE.PlaneGeometry(anchoTotal, alto),
        new THREE.MeshBasicMaterial({ color: colorFondo, transparent: true, opacity: 0.5 })
    );
    group.add(fondo);

    // Bordes
    const bordeIzq = new THREE.Mesh(
        new THREE.PlaneGeometry(anchoBorde, alto),
        new THREE.MeshBasicMaterial({ color: colorBordeIzq })
    );
    bordeIzq.position.x = -anchoTotal / 2 + anchoBorde / 2;
    group.add(bordeIzq);

    const bordeDer = new THREE.Mesh(
        new THREE.PlaneGeometry(anchoBorde, alto),
        new THREE.MeshBasicMaterial({ color: colorBordeDer })
    );
    bordeDer.position.x = anchoTotal / 2 - anchoBorde / 2;
    group.add(bordeDer);

    // Texto
    const textoMesh = crearTextoPlano(texto, anchoTotal * 0.9, alto);
    group.add(textoMesh);
    group.userData.texto = textoMesh;

    return group;
}

// Crear el marcador completo
function crearMarcadorCompleto(textoIzq, textoCentro, textoDer) {
    const marcador = new THREE.Group();

    const izq = crearRectanguloConTexto(textoIzq, '#3396ff', '#3396ff', '#3396ff');
    const centro = crearTextoPlano(textoCentro); // sin fondo
    const der = crearRectanguloConTexto(textoDer, '#fe1c1c', '#bd0505', '#fe1c1c');

    izq.position.set(-1.6, 0, 0);
    centro.position.set(0, 0, 0);
    der.position.set(1.6, 0, 0);

    marcador.add(izq);
    //marcador.add(centro);
    marcador.add(der);

    // Guardar referencias para actualización
    marcador.userData.izq = izq.userData.texto;
    marcador.userData.centro = centro;
    marcador.userData.der = der.userData.texto;

    return marcador;
}

// Crear y añadir el marcador a la escena
const marcadorUI = crearMarcadorCompleto("0", "01:00", "0");
marcadorUI.position.set(0, 2, -8.5);
camera.add(marcadorUI);



/* MISION */

function crearAlertaMision(texto, duracionSegundos = 4) {
    // Crear un canvas estilizado
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    // Fondo con bordes redondeados
    const radius = 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(canvas.width - radius, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
    ctx.lineTo(canvas.width, canvas.height - radius);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height);
    ctx.lineTo(radius, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Texto centrado
    ctx.font = '26px Poppins';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, canvas.width / 2, canvas.height / 2);

    // Crear textura y mesh
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const geometry = new THREE.PlaneGeometry(3, 0.55); // Tamaño visual del panel
    const alertaMesh = new THREE.Mesh(geometry, material);

    // Mostrar frente a la cámara
    camera.add(alertaMesh);
    alertaMesh.position.set(0, 0, -8); // centrado y arriba del campo visual

    // Eliminar luego de X segundos
    setTimeout(() => {
        camera.remove(alertaMesh);
        alertaMesh.geometry.dispose();
        alertaMesh.material.map.dispose();
        alertaMesh.material.dispose();
    }, duracionSegundos * 1000);
}


/* BARRA DE PROGRESO */
function crearBarraProgreso(colorFondo = '#222', colorRelleno = '#00ff00') {
    const grupo = new THREE.Group();

    // Fondo (marco gris)
    const fondoGeo = new THREE.PlaneGeometry(5, 0.16);
    const fondoMat = new THREE.MeshBasicMaterial({ color: colorFondo });
    const fondo = new THREE.Mesh(fondoGeo, fondoMat);
    grupo.add(fondo);

    // Relleno (barra verde)
    const rellenoGeo = new THREE.PlaneGeometry(4.96, 0.08);
    const rellenoMat = new THREE.MeshBasicMaterial({ color: colorRelleno });
    const relleno = new THREE.Mesh(rellenoGeo, rellenoMat);
    relleno.position.set(-2.48, 0, 0); // delante y a la izquierda
    relleno.scale.set(0, 1, 1); // inicio vacío
    grupo.add(relleno);

    // Posiciona frente a la cámara (como HUD)
    camera.add(grupo);
    grupo.position.set(0, -0.5, -2); // un poco abajo

    // Devuelve el grupo y la barra para que la puedas actualizar
    return {
        grupo,
        fondo,
        relleno,
        setValor: (valor) => {
            const clamped = Math.max(0, Math.min(1, valor / 100)); // asegura un rango de 0 a 1
            relleno.scale.x = clamped;
            relleno.position.x = -2.48 + clamped * 2.48; // ajustar alineación izquierda
        }
    };
}

const barraMunicion_vr = crearBarraProgreso('#333', '#ffc107');
barraMunicion_vr.grupo.position.set(0, 1, -9);

const barraFuerza_vr = crearBarraProgreso('#333', '#a80000');
barraFuerza_vr.grupo.position.set(0, 0.7, -9);
barraFuerza_vr.setValor(100);

/* ATAQUE */
function crearFondoRadialPantalla(renderer, camera) {
    const aspecto = window.innerWidth / window.innerHeight;
    const height = 2;
    const width = height * aspecto;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Gradiente: pequeño centro transparente, resto cubierto
    const gradiente = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.01,  // Pequeño centro transparente
        canvas.width / 2, canvas.height / 2, canvas.width * 0.9    // Exterior cubre casi toda la pantalla
    );

    gradiente.addColorStop(0.0, 'rgba(255, 0, 0, 0)');     // Centro transparente
    gradiente.addColorStop(0.1, 'rgba(255, 0, 0, 0.3)');
    gradiente.addColorStop(0.4, 'rgba(255, 0, 0, 0.6)');
    gradiente.addColorStop(1.0, 'rgba(144, 0, 0, 1)');     // Rojo oscuro en los bordes

    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        depthTest: false
    });

    const plano = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    plano.renderOrder = 999;
    plano.material.depthWrite = false;

    // Agregar al HUD de VR
    const cam = renderer.xr.getCamera(camera);
    cam.add(plano);
    plano.position.set(0, 0, -0.01);

    // Mostrar efecto con GSAP
    gsap.to(material, {
        opacity: 0,
        duration: 1,
        ease: 'power2.inOut'
    });

    return plano;
}

const fondo = crearFondoRadialPantalla(renderer);
camera.add(fondo);
fondo.position.set(0, 0, -0.5);