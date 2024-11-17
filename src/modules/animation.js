import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export function initializeLogoAnimation() {
  const container = document.getElementById('model-container');
  if (!container) return;

  // Set up scene
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ 
    alpha: true,
    antialias: true 
  });
  
  renderer.setSize(800, 800);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  // Lighting setup
  const ambientLight = new THREE.AmbientLight(0xfff2e6, 0.8);  // Warm ambient light
  scene.add(ambientLight);
  
  // Main warm front light
  const frontLight = new THREE.DirectionalLight(0xffd700, 1.2);  // Golden front light
  frontLight.position.set(0, 0, 5);
  scene.add(frontLight);

  // Subtle warm rim light
  const backLight = new THREE.DirectionalLight(0xff8c42, 0.4);  // Orange-tinted back light
  backLight.position.set(0, 0, -5);
  scene.add(backLight);

  // Add a subtle fill light from above
  const topLight = new THREE.DirectionalLight(0xffe4c4, 0.3);  // Bisque colored top light
  topLight.position.set(0, 5, 0);
  scene.add(topLight);

  // Texture loading with debug logs
  const textureLoader = new THREE.TextureLoader();
  
  const baseColorTexture = textureLoader.load(
    chrome.runtime.getURL('textures/DuckHead_BaseColor.png'));
  
  const normalTexture = textureLoader.load(
    chrome.runtime.getURL('textures/DuckHead_Normal.png'));
  
  const roughnessTexture = textureLoader.load(
    chrome.runtime.getURL('textures/DuckHead_Roughness.png'));

  // Load the model
  const loader = new FBXLoader();
  const modelPath = chrome.runtime.getURL('source/DuckHead.fbx');

  loader.load(
    modelPath,
    (fbx) => {
      
      // Apply textures
      fbx.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            map: baseColorTexture,
            normalMap: normalTexture,
            roughnessMap: roughnessTexture,
            roughness: 1.0,
            metalness: 0.0
          });
          
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      scene.add(fbx);

      // Directly set a large scale
      fbx.scale.set(0.5, 0.5, 0.5);  // Much larger scale
      
      // Center the model
      const box = new THREE.Box3().setFromObject(fbx);
      const center = box.getCenter(new THREE.Vector3());
      fbx.position.sub(center);
      
      // Adjust position if needed
      fbx.position.y = -2;  // Adjust these values as needed
      fbx.position.z = 0;  // Adjust these values as needed
      
      fbx.rotation.x = 0;
      fbx.rotation.y = Math.PI;
      fbx.rotation.z = 0;

      window.duckModel = fbx;
    },
    (error) => {
      console.error('Error loading model:', error);
    }
  );

  // Position camera
  camera.position.z = 50;  // Increased to 50 to maintain proportions

  let currentRotationX = 0;
  let currentRotationY = 0;
  let velocityX = 0;
  let velocityY = 0;

  // Modified mouse movement handling
  document.addEventListener('mousemove', (event) => {
    if (!window.duckModel) return;
    
    const rect = container.getBoundingClientRect();
    const mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Reduced rotation sensitivity (previously 0.3 and 0.2)
    const targetRotationY = mouseX * 0.5;  // Halved from 0.3
    const targetRotationX = -mouseY * 0.4;  // Halved from 0.2
    
    // Update velocities
    velocityX = (targetRotationX - currentRotationX) * 0.05;
    velocityY = (targetRotationY - currentRotationY) * 0.05;
  });

  // Modified animation loop
  function animate() {
    requestAnimationFrame(animate);

    if (window.duckModel) {
      // Apply inertia and damping
      const damping = 0.95; // Controls how quickly the movement settles (0-1)
      
      // Update current rotation with velocity
      currentRotationX += velocityX;
      currentRotationY += velocityY;
      
      // Apply damping to velocity
      velocityX *= damping;
      velocityY *= damping;
      
      // Apply the rotations
      window.duckModel.rotation.x += (currentRotationX - window.duckModel.rotation.x) * 0.1;
      window.duckModel.rotation.y += (currentRotationY - window.duckModel.rotation.y) * 0.1;
    }

    renderer.render(scene, camera);
  }

  animate();

  // Handle window resize
  window.addEventListener('resize', () => {
    camera.aspect = 1;  // Keep it square (800/800)
    camera.updateProjectionMatrix();
    renderer.setSize(200, 200);  // Keep consistent size
  });
} 