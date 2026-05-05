import * as THREE from "three";

export interface GestureScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  target: THREE.Mesh;
  cursor: THREE.Mesh;
  animate: () => void;
  moveCursor: (x: number, y: number) => void;
  grabTarget: () => void;
  releaseTarget: () => void;
  zoomCamera: (delta: number) => void;
  rotateTarget: (angle: number) => void;
}

export function createScene(container: HTMLElement): GestureScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);

  const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 5);

  const ambientLight = new THREE.AmbientLight(0x404040, 2);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 3);
  dirLight.position.set(5, 5, 5);
  scene.add(dirLight);

  const target = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.8, 2),
    new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.3, metalness: 0.7 })
  );
  scene.add(target);

  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.8 })
  );
  scene.add(cursor);

  let isGrabbing = false;
  const targetVelocity = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);

    if (isGrabbing) {
      target.position.lerp(cursor.position, 0.08);
    } else {
      target.rotation.y += 0.005;
      target.rotation.x += 0.002;
    }

    renderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    target,
    cursor,
    animate,
    moveCursor(x: number, y: number) {
      cursor.position.x = (1 - x - 0.5) * 6;
      cursor.position.y = -(y - 0.5) * 4;
    },
    grabTarget() {
      isGrabbing = true;
      (target.material as THREE.MeshStandardMaterial).color.set(0xf59e0b);
      (target.material as THREE.MeshStandardMaterial).emissive.set(0xf59e0b);
      (target.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
    },
    releaseTarget() {
      isGrabbing = false;
      (target.material as THREE.MeshStandardMaterial).color.set(0x6366f1);
      (target.material as THREE.MeshStandardMaterial).emissive.set(0x000000);
    },
    zoomCamera(delta: number) {
      camera.position.z = THREE.MathUtils.clamp(5 - delta * 10, 2, 10);
    },
    rotateTarget(angle: number) {
      target.rotation.z = angle;
    },
  };
}
