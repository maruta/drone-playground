import * as BABYLON from 'babylonjs';
import 'babylonjs-loaders';
import { GridMaterial, ShadowOnlyMaterial } from 'babylonjs-materials';
import * as monaco from 'monaco-editor';
import { DynamicSystem, vectorAdd, vectorScale } from './dynamicSystem';
import * as GUI from 'babylonjs-gui';
import { compressUrlSafe, decompressUrlSafe } from './vendor/lzma-url.mjs';
import defaultCode from '../example/default.js?raw';

interface Drone {
    mesh: BABYLON.Mesh;
    controller: (state: DroneState, t: number) => ControlInput;
    dynamicSystem: DynamicSystem;
    state: DroneState;
    label: BABYLON.Mesh;
    rotorAnimation?: BABYLON.AnimationGroup;
    isStopped?: boolean;
    stopReason?: string;
}

interface DroneState {
    position: BABYLON.Vector3;
    rotationQuaternion: BABYLON.Quaternion;
    velocity: BABYLON.Vector3;
    angularVelocity: BABYLON.Vector3;
}

interface ControlInput {
    rollYawRatePitch?: BABYLON.Vector3;
    throttle?: number;
    action?: 'normal' | 'despawn' | 'stop';
    reason?: string;
}

declare global {
    interface Window {
        simulator: DroneSimulator;
    }
}

class DroneSimulator {
    private canvas: HTMLCanvasElement;
    private editorContainer: HTMLElement;
    private engine: BABYLON.Engine;
    private scene: BABYLON.Scene;
    private camera!: BABYLON.UniversalCamera;
    private drones: Map<string, Drone>;
    private editor!: monaco.editor.IStandaloneCodeEditor;
    private droneTemplate: BABYLON.Mesh | null = null;
    private editorVisible: boolean = true;
    private toggleButton!: HTMLButtonElement;
    private runButton!: HTMLButtonElement;
    private advancedTexture!: GUI.AdvancedDynamicTexture;
    private propellerSpeed: number = 5;
    private isSimulationRunning: boolean = true;
    private t: number = 0;
    private toggleSimulationButton!: HTMLButtonElement;
    private resetTimeButton!: HTMLButtonElement;
    private despawnAllButton!: HTMLButtonElement;
    private shadowGenerator!: BABYLON.ShadowGenerator;
    private fpsIndicator!: HTMLElement;
    private timeIndicator!: HTMLElement;
    private droneCountIndicator!: HTMLElement;
    private cameraPositionIndicator!: HTMLElement;
    private cameraRotationIndicator!: HTMLElement;
    private cameraSpeed: number = 0.4;
    private trackScale: number = 200;
    private codeChanged: boolean = false;
    
    // Camera following mode
    private followedDroneName: string | null = null;
    private filteredDroneVelocity: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
    private cameraRelativePosition: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
    private cameraRelativeTarget: BABYLON.Vector3 = new BABYLON.Vector3(0, 0, 0);
    
    // Input handling
    private keys: { [key: string]: boolean } = {};
    private lastDragDistance: number = 0;
    private lastPinchTime: number = 0;

    constructor(canvas: HTMLCanvasElement, editorContainer: HTMLElement) {
        this.canvas = canvas;
        this.editorContainer = editorContainer;
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.scene = new BABYLON.Scene(this.engine);
        this.drones = new Map();
        
        
        this.setupScene();
        this.setupCodeEditor();
        this.setupGUI();
        this.toggleEditorVisibility();
        this.runCode();
    }

    private setupGUI(): void {
        this.advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        this.toggleSimulationButton = document.getElementById('pause') as HTMLButtonElement;
        this.resetTimeButton = document.getElementById('reset') as HTMLButtonElement;
        this.despawnAllButton = document.getElementById('despawnAll') as HTMLButtonElement;
        this.resetTimeButton.addEventListener('click', () => this.resetTime());
        this.toggleSimulationButton.addEventListener('click', () => this.toggleSimulation());
        this.despawnAllButton.addEventListener('click', () => this.despawnAll());
        this.fpsIndicator = document.getElementById('fps') as HTMLElement;
        this.timeIndicator = document.getElementById('time') as HTMLElement;
        this.droneCountIndicator = document.getElementById('droneCount') as HTMLElement;
        this.cameraPositionIndicator = document.getElementById('cameraPosition') as HTMLElement;
        this.cameraRotationIndicator = document.getElementById('cameraRotation') as HTMLElement;
    }

    private calculateTextureSize(text: string): { textureWidth: number, textureHeight: number } {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        context.font = "bold 48px BIZ UDPGothic, Arial, sans-serif";
        
        const lines = text.split('\n');
        const lineHeight = 60;
        
        let maxWidth = 0;
        lines.forEach(line => {
            if (line.trim()) {
                const lineWidth = context.measureText(line).width;
                maxWidth = Math.max(maxWidth, lineWidth);
            }
        });
        
        const textureWidth = Math.max(256, maxWidth + 40);
        const textureHeight = Math.max(64, lines.length * lineHeight + 20);
        
        return { textureWidth, textureHeight };
    }

    private updateTextTexture(texture: BABYLON.DynamicTexture, text: string, textColor: string, backgroundColor: string): void {
        const context = texture.getContext() as CanvasRenderingContext2D;
        const size = texture.getSize();
        
        context.clearRect(0, 0, size.width, size.height);
        
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, size.width, size.height);
        
        context.font = "bold 48px BIZ UDPGothic, Arial, sans-serif";
        context.fillStyle = textColor;
        context.textAlign = "center";
        context.textBaseline = "middle";
        
        const lines = text.split('\n');
        const lineHeight = 60;
        const totalHeight = lines.length * lineHeight;
        const startY = (size.height - totalHeight) / 2 + lineHeight / 2;
        
        lines.forEach((line, index) => {
            const yPos = startY + index * lineHeight;
            context.fillText(line, size.width / 2, yPos);
        });
        
        texture.update();
    }

    private createOrUpdateDroneLabel(droneName: string, text: string, textColor: string, backgroundColor: string, existingLabel?: BABYLON.Mesh): BABYLON.Mesh {
        const { textureWidth, textureHeight } = this.calculateTextureSize(text);
        const textTexture = new BABYLON.DynamicTexture("labelTexture_" + droneName, { width: textureWidth, height: textureHeight }, this.scene);
        
        let textMesh: BABYLON.Mesh;
        
        if (existingLabel) {
            textMesh = existingLabel;
            
            const aspectRatio = textureWidth / textureHeight;
            const worldHeight = textureHeight / 60;
            const worldWidth = worldHeight * aspectRatio;
            
            const oldPosition = textMesh.position.clone();
            const oldRotation = textMesh.rotation.clone();
            const oldScaling = textMesh.scaling.clone();
            
            textMesh.dispose();
            textMesh = BABYLON.MeshBuilder.CreatePlane("label_" + droneName, { width: worldWidth, height: worldHeight }, this.scene);
            
            textMesh.position = oldPosition;
            textMesh.rotation = oldRotation;
            textMesh.scaling = oldScaling;
        } else {
            const aspectRatio = textureWidth / textureHeight;
            const worldHeight = textureHeight / 60;
            const worldWidth = worldHeight * aspectRatio;
            textMesh = BABYLON.MeshBuilder.CreatePlane("label_" + droneName, { width: worldWidth, height: worldHeight }, this.scene);
            
            textMesh.position = new BABYLON.Vector3(0, 1, 0);
        }
        
        textTexture.hasAlpha = true;
        
        const textMaterial = new BABYLON.StandardMaterial("labelMaterial_" + droneName, this.scene);
        textMaterial.diffuseTexture = textTexture;
        textMaterial.emissiveTexture = textTexture;
        textMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
        textMaterial.disableLighting = true;
        textMaterial.backFaceCulling = false;
        textMaterial.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
        textMaterial.useAlphaFromDiffuseTexture = true;
        
        textMesh.material = textMaterial;
        
        this.updateTextTexture(textTexture, text, textColor, backgroundColor);
        
        return textMesh;
    }

    private setupCameraKeyboardControl(): void {
        const scene = this.scene;
        
        scene.onKeyboardObservable.add((kbInfo) => {
            const keyName = kbInfo.event.key.toLowerCase();
            
            if (keyName.startsWith('arrow')) {
                kbInfo.event.preventDefault();
            }
            
            if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
                this.keys[keyName] = true;
            } else if (kbInfo.type === BABYLON.KeyboardEventTypes.KEYUP) {
                this.keys[keyName] = false;
            }
        });

        // Reset key states when focus is lost
        window.addEventListener('blur', () => {
            Object.keys(this.keys).forEach(key => {
                this.keys[key] = false;
            });
        });
        
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                Object.keys(this.keys).forEach(key => {
                    this.keys[key] = false;
                });
            }
        });

        scene.onBeforeRenderObservable.add(() => {
            let moveDirection = BABYLON.Vector3.Zero();

            if (this.keys['w']) moveDirection.addInPlace(this.getForwardDirection());
            if (this.keys['s']) moveDirection.addInPlace(this.getForwardDirection().scale(-1));
            if (this.keys['a']) moveDirection.addInPlace(this.getRightDirection().scale(-1));
            if (this.keys['d']) moveDirection.addInPlace(this.getRightDirection());
            if (this.keys['q']) moveDirection.addInPlace(BABYLON.Vector3.Up());
            if (this.keys['e']) moveDirection.addInPlace(BABYLON.Vector3.Down());

            if (!moveDirection.equals(BABYLON.Vector3.Zero())) {
                moveDirection.normalize().scaleInPlace(this.cameraSpeed);
                if (this.followedDroneName) {
                    this.cameraRelativePosition.addInPlace(moveDirection);
                    this.cameraRelativeTarget.addInPlace(moveDirection);
                } else {
                    this.camera.target.addInPlace(moveDirection);
                    this.camera.position.addInPlace(moveDirection);
                }
            }

            const rotationSpeed = 0.02;
            let deltaYaw = 0;
            let deltaPitch = 0;

            if (this.keys['arrowleft']) deltaYaw -= rotationSpeed;
            if (this.keys['arrowright']) deltaYaw += rotationSpeed;
            if (this.keys['arrowup']) deltaPitch -= rotationSpeed;
            if (this.keys['arrowdown']) deltaPitch += rotationSpeed;

            if (deltaYaw !== 0 || deltaPitch !== 0) {
                if (this.followedDroneName) {
                    this.rotateAroundDrone(deltaYaw, deltaPitch);
                } else {
                    this.camera.rotation.y += deltaYaw;
                    this.camera.rotation.x += deltaPitch;
                    this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
                    
                    const direction = this.camera.getDirection(BABYLON.Vector3.Forward());
                    this.camera.target = this.camera.position.add(direction);
                }
            }
        });
    }

    /**
     * Setup drone click handler for camera following
     */
    private setupMouseClickHandler(): void {
        this.canvas.addEventListener('click', (event) => {
            // Only process click if there was no significant drag
            const dragThreshold = 5; // pixels
            if (this.lastDragDistance > dragThreshold) {
                // Reset drag distance and ignore this click
                this.lastDragDistance = 0;
                return;
            }
            
            // Ignore clicks shortly after pinch gestures
            const pinchCooldownMs = 300; // milliseconds
            const currentTime = Date.now();
            if (currentTime - this.lastPinchTime < pinchCooldownMs) {
                return;
            }
            
            // Clear all arrow key states on any click
            const arrowKeys = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
            arrowKeys.forEach(key => {
                if (this.keys[key]) {
                    this.keys[key] = false;
                }
            });
            
            const pickInfo = this.scene.pick(event.offsetX, event.offsetY);
            
            if (pickInfo.hit && pickInfo.pickedMesh) {
                // Check if clicked mesh is a drone or drone label
                let droneName: string | null = null;
                for (const [name, drone] of this.drones) {
                    if (pickInfo.pickedMesh === drone.mesh || 
                        drone.mesh.getChildMeshes().includes(pickInfo.pickedMesh) ||
                        pickInfo.pickedMesh === drone.label) {
                        droneName = name;
                        break;
                    }
                }
                
                if (droneName) {
                    this.setFollowedDrone(droneName);
                } else {
                    this.clearFollowedDrone();
                }
            } else {
                this.clearFollowedDrone();
            }
        });
    }

    private setFollowedDrone(droneName: string): void {
        if (this.followedDroneName !== droneName) {
            const previousFollowedDrone = this.followedDroneName;
            
            // Reset ALL key states before switching modes
            Object.keys(this.keys).forEach(key => {
                this.keys[key] = false;
            });
            
            this.followedDroneName = droneName;
            
            // Record relative position from drone to camera
            if (this.drones.has(droneName)) {
                const followedDrone = this.drones.get(droneName)!;
                const dronePosition = followedDrone.state.position;
                
                // Calculate relative position and target
                this.cameraRelativePosition = this.camera.position.subtract(dronePosition);
                this.cameraRelativeTarget = this.camera.target.subtract(dronePosition);
                
                // Initialize camera velocity to match drone's XZ velocity
                const droneVelocity = followedDrone.state.velocity;
                this.filteredDroneVelocity = new BABYLON.Vector3(droneVelocity.x, 0, droneVelocity.z);
            } else {
                this.filteredDroneVelocity = new BABYLON.Vector3(0, 0, 0);
            }
            
            // Update label colors
            if (previousFollowedDrone && this.drones.has(previousFollowedDrone)) {
                this.updateDroneLabel(this.drones.get(previousFollowedDrone)!);
            }
            if (this.drones.has(droneName)) {
                this.updateDroneLabel(this.drones.get(droneName)!);
            }
        }
    }

    private clearFollowedDrone(): void {
        if (this.followedDroneName) {
            const previousFollowedDrone = this.followedDroneName;
            this.followedDroneName = null;
            this.filteredDroneVelocity = new BABYLON.Vector3(0, 0, 0);
            this.cameraRelativePosition = new BABYLON.Vector3(0, 0, 0);
            this.cameraRelativeTarget = new BABYLON.Vector3(0, 0, 0);
            
            if (this.drones.has(previousFollowedDrone)) {
                this.updateDroneLabel(this.drones.get(previousFollowedDrone)!);
            }
        }
    }

    /**
     * Setup custom camera controls that work with following mode
     */
    private setupCustomCameraControls(): void {
        const scene = this.scene;
        let isRightPointerDown = false;
        let isLeftPointerDown = false;
        let lastPointerX = 0;
        let lastPointerY = 0;
        let isTouchRotating = false;
        let isTouchMoving = false;
        let dragStartX = 0;
        let dragStartY = 0;
        let totalDragDistance = 0;
        
        // Touch-specific tracking
        let touchStartDistance = 0;
        let touchCenterX = 0;
        let touchCenterY = 0;
        let isPinching = false;
        let lastPinchDistance = 0;
        let lastTouchCenterX = 0;
        let lastTouchCenterY = 0;
        const activeTouches = new Map<number, { x: number, y: number }>();

        scene.onPointerObservable.add((pointerInfo) => {
            const evt = pointerInfo.event as PointerEvent;
            const isTouch = evt.pointerType === 'touch';
            
            switch (pointerInfo.type) {
                case BABYLON.PointerEventTypes.POINTERDOWN:
                    if (isTouch) {
                        activeTouches.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
                        
                        if (activeTouches.size === 1) {
                            isTouchRotating = true;
                            lastPointerX = evt.clientX;
                            lastPointerY = evt.clientY;
                            dragStartX = evt.clientX;
                            dragStartY = evt.clientY;
                            totalDragDistance = 0;
                        } else if (activeTouches.size === 2) {
                            isTouchRotating = false;
                            isTouchMoving = true;
                            
                            const touches = Array.from(activeTouches.values());
                            touchCenterX = (touches[0].x + touches[1].x) / 2;
                            touchCenterY = (touches[0].y + touches[1].y) / 2;
                            lastTouchCenterX = touchCenterX;
                            lastTouchCenterY = touchCenterY;
                            
                            // Calculate initial distance for pinch-to-zoom
                            const dx = touches[1].x - touches[0].x;
                            const dy = touches[1].y - touches[0].y;
                            touchStartDistance = Math.sqrt(dx * dx + dy * dy);
                            lastPinchDistance = touchStartDistance;
                            isPinching = false;
                        }
                        } else {
                            if (evt.button === 0) {
                                isLeftPointerDown = true;
                            lastPointerX = evt.clientX;
                            lastPointerY = evt.clientY;
                            dragStartX = evt.clientX;
                            dragStartY = evt.clientY;
                            totalDragDistance = 0;
                        } else if (evt.button === 2) {
                            // Right mouse button for rotation
                            isRightPointerDown = true;
                            lastPointerX = evt.clientX;
                            lastPointerY = evt.clientY;
                        }
                    }
                    break;

                case BABYLON.PointerEventTypes.POINTERUP:
                    if (isTouch) {
                        activeTouches.delete(evt.pointerId);
                        
                        if (activeTouches.size === 0) {
                            // All touches released
                            if (isTouchRotating) {
                                this.lastDragDistance = totalDragDistance;
                            }
                            isTouchRotating = false;
                            isTouchMoving = false;
                            isPinching = false;
                        } else if (activeTouches.size === 1 && isTouchMoving) {
                            // Switched from two touches to one
                            isTouchMoving = false;
                            isTouchRotating = true;
                            isPinching = false;
                            const remainingTouch = Array.from(activeTouches.values())[0];
                            lastPointerX = remainingTouch.x;
                            lastPointerY = remainingTouch.y;
                        }
                    } else {
                        // Mouse events
                        if (evt.button === 0) {
                            isLeftPointerDown = false;
                            this.lastDragDistance = totalDragDistance;
                        } else if (evt.button === 2) {
                            isRightPointerDown = false;
                        }
                    }
                    break;

                case BABYLON.PointerEventTypes.POINTERMOVE:
                    if (isTouch) {
                        // Update touch position
                        if (activeTouches.has(evt.pointerId)) {
                            activeTouches.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
                        }
                        
                        if (isTouchRotating && activeTouches.size === 1) {
                            // Single touch rotation
                            const deltaX = evt.clientX - lastPointerX;
                            const deltaY = evt.clientY - lastPointerY;
                            const rotationSpeed = 0.005;
                            
                            if (this.followedDroneName) {
                                this.rotateAroundDrone(deltaX * rotationSpeed, deltaY * rotationSpeed);
                            } else {
                                // Touch rotation: invert X and Y for intuitive movement
                                this.camera.rotation.y -= deltaX * rotationSpeed;  // Invert X
                                this.camera.rotation.x -= deltaY * rotationSpeed;  // Invert Y
                                this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
                                
                                const direction = this.camera.getDirection(BABYLON.Vector3.Forward());
                                this.camera.target = this.camera.position.add(direction);
                            }
                            
                            lastPointerX = evt.clientX;
                            lastPointerY = evt.clientY;
                            totalDragDistance += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                        } else if (isTouchMoving && activeTouches.size === 2) {
                            // Two touch movement/pinch
                            const touches = Array.from(activeTouches.values());
                            touchCenterX = (touches[0].x + touches[1].x) / 2;
                            touchCenterY = (touches[0].y + touches[1].y) / 2;
                            
                            // Calculate current distance for pinch-to-zoom
                            const dx = touches[1].x - touches[0].x;
                            const dy = touches[1].y - touches[0].y;
                            const currentDistance = Math.sqrt(dx * dx + dy * dy);
                            
                            // Check if this is a pinch gesture (distance change is significant)
                            const distanceThreshold = 10; // pixels - reduced for smoother detection
                            const distanceChange = Math.abs(currentDistance - touchStartDistance);
                            
                            if (distanceChange > distanceThreshold) {
                                isPinching = true;
                                this.lastPinchTime = Date.now();
                            }
                            
                            if (isPinching) {
                                // Pinch-to-zoom: forward/backward movement (smooth incremental)
                                const zoomSensitivity = 0.05;
                                const zoomDelta = (currentDistance - lastPinchDistance) * zoomSensitivity;
                                
                                if (Math.abs(zoomDelta) > 0.1) { // Only move if delta is significant
                                    let moveVector: BABYLON.Vector3;
                                    
                                    if (this.followedDroneName) {
                                        // In follow mode: move towards/away from drone
                                        const followedDrone = this.drones.get(this.followedDroneName);
                                        if (followedDrone) {
                                            const dronePosition = followedDrone.state.position;
                                            const cameraPosition = this.camera.position;
                                            const towardsDrone = dronePosition.subtract(cameraPosition).normalize();
                                            moveVector = towardsDrone.scale(zoomDelta);
                                            
                                            this.cameraRelativePosition.addInPlace(moveVector);
                                            this.cameraRelativeTarget.addInPlace(moveVector);
                                        }
                                    } else {
                                        // Normal mode: move in camera forward direction
                                        const forward = this.camera.getDirection(BABYLON.Vector3.Forward());
                                        moveVector = forward.scale(zoomDelta);
                                        
                                        this.camera.position.addInPlace(moveVector);
                                        this.camera.target.addInPlace(moveVector);
                                    }
                                    
                                    lastPinchDistance = currentDistance;
                                }
                            } else {
                                // Two-finger drag: lateral movement (only if not pinching)
                                const deltaX = touchCenterX - lastTouchCenterX;
                                const deltaY = touchCenterY - lastTouchCenterY;
                                const moveSpeed = 0.02;
                                
                                const right = this.getRightDirection();
                                const moveVector = right.scale(-deltaX * moveSpeed)
                                    .add(BABYLON.Vector3.Up().scale(deltaY * moveSpeed));
                                
                                if (this.followedDroneName) {
                                    this.cameraRelativePosition.addInPlace(moveVector);
                                    this.cameraRelativeTarget.addInPlace(moveVector);
                                } else {
                                    this.camera.position.addInPlace(moveVector);
                                    this.camera.target.addInPlace(moveVector);
                                }
                            }
                            
                            lastTouchCenterX = touchCenterX;
                            lastTouchCenterY = touchCenterY;
                        }
                    } else {
                        // Mouse movement
                        const deltaX = evt.clientX - lastPointerX;
                        const deltaY = evt.clientY - lastPointerY;
                        
                        if (isLeftPointerDown) {
                            // Camera movement with left drag
                            const moveSpeed = 0.02;
                            const right = this.getRightDirection();
                            const moveVector = right.scale(-deltaX * moveSpeed)
                                .add(BABYLON.Vector3.Up().scale(deltaY * moveSpeed));
                            
                            if (this.followedDroneName) {
                                this.cameraRelativePosition.addInPlace(moveVector);
                                this.cameraRelativeTarget.addInPlace(moveVector);
                            } else {
                                this.camera.position.addInPlace(moveVector);
                                this.camera.target.addInPlace(moveVector);
                            }
                            
                            totalDragDistance += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
                        } else if (isRightPointerDown) {
                            // Camera rotation with right drag
                            const rotationSpeed = 0.003;
                            
                            if (this.followedDroneName) {
                                this.rotateAroundDrone(deltaX * rotationSpeed, deltaY * rotationSpeed);
                            } else {
                                this.camera.rotation.y += deltaX * rotationSpeed;
                                this.camera.rotation.x += deltaY * rotationSpeed;
                                this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
                                
                                const direction = this.camera.getDirection(BABYLON.Vector3.Forward());
                                this.camera.target = this.camera.position.add(direction);
                            }
                        }
                        
                        lastPointerX = evt.clientX;
                        lastPointerY = evt.clientY;
                    }
                    break;
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Setup mouse wheel for zooming in follow mode
     */
    private setupMouseWheel(): void {
        this.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            
            const zoomSpeed = 0.1;
            const delta = event.deltaY > 0 ? 1 : -1;
            
            if (this.followedDroneName) {
                // In follow mode, move along the direction from drone to camera
                const distance = this.cameraRelativePosition.length();
                const direction = this.cameraRelativePosition.normalizeToNew();
                
                // Prevent getting too close or too far
                const newDistance = Math.max(2, Math.min(50, distance + delta * zoomSpeed * distance));
                
                // Update relative position while maintaining direction
                this.cameraRelativePosition = direction.scale(newDistance);
                
                // Update relative target to maintain the same view direction
                const cameraDirection = this.camera.getDirection(BABYLON.Vector3.Forward());
                this.cameraRelativeTarget = this.cameraRelativePosition.add(cameraDirection);
            } else {
                // Normal mode - move along camera forward direction
                const forward = this.camera.getDirection(BABYLON.Vector3.Forward());
                const moveVector = forward.scale(-delta * zoomSpeed * 5);
                this.camera.position.addInPlace(moveVector);
                this.camera.target.addInPlace(moveVector);
            }
        });
    }

    private setupGamepadControl(): void {
        const scene = this.scene;
        const deadzone = 0.15;
        const rotationSpeed = 0.03;
        const verticalSpeed = this.cameraSpeed;

        const buttonStates: { [key: number]: boolean } = {};

        scene.onBeforeRenderObservable.add(() => {
            // Get all connected gamepads
            const gamepads = navigator.getGamepads();
            
            for (let i = 0; i < gamepads.length; i++) {
                const gamepad = gamepads[i];
                if (!gamepad) continue;

                if (gamepad.buttons[9] && gamepad.buttons[9].pressed) {
                    if (!buttonStates[9]) {
                        this.toggleSimulation();
                        buttonStates[9] = true;
                    }
                } else {
                    buttonStates[9] = false;
                }

                if (gamepad.buttons[8] && gamepad.buttons[8].pressed) {
                    if (!buttonStates[8]) {
                        this.runCode();
                        buttonStates[8] = true;
                    }
                } else {
                    buttonStates[8] = false;
                }

                if (gamepad.buttons[0] && gamepad.buttons[0].pressed) {
                    if (!buttonStates[0]) {
                        this.despawnAll();
                        buttonStates[0] = true;
                    }
                } else {
                    buttonStates[0] = false;
                }

                const leftStickX = Math.abs(gamepad.axes[0]) > deadzone ? gamepad.axes[0] : 0;
                const leftStickY = Math.abs(gamepad.axes[1]) > deadzone ? gamepad.axes[1] : 0;

                const rightStickX = Math.abs(gamepad.axes[2]) > deadzone ? gamepad.axes[2] : 0;
                const rightStickY = Math.abs(gamepad.axes[3]) > deadzone ? gamepad.axes[3] : 0;

                let leftTrigger = 0;
                let rightTrigger = 0;

                if (gamepad.buttons[6] && gamepad.buttons[6].value) {
                    leftTrigger = gamepad.buttons[6].value;
                }
                if (gamepad.buttons[7] && gamepad.buttons[7].value) {
                    rightTrigger = gamepad.buttons[7].value;
                }

                let moveDirection = BABYLON.Vector3.Zero();

                if (leftStickX !== 0 || leftStickY !== 0) {
                    const forward = this.getForwardDirection().scale(-leftStickY);
                    const right = this.getRightDirection().scale(leftStickX);
                    moveDirection.addInPlace(forward);
                    moveDirection.addInPlace(right);
                    moveDirection.y = 0;
                }

                if (leftTrigger > 0) {
                    moveDirection.addInPlace(BABYLON.Vector3.Down().scale(leftTrigger));
                }
                if (rightTrigger > 0) {
                    moveDirection.addInPlace(BABYLON.Vector3.Up().scale(rightTrigger));
                }

                if (!moveDirection.equals(BABYLON.Vector3.Zero())) {
                    moveDirection.normalize().scaleInPlace(this.cameraSpeed);
                    if (this.followedDroneName) {
                        this.cameraRelativePosition.addInPlace(moveDirection);
                        this.cameraRelativeTarget.addInPlace(moveDirection);
                    } else {
                        this.camera.target.addInPlace(moveDirection);
                        this.camera.position.addInPlace(moveDirection);
                    }
                }

                if (rightStickX !== 0 || rightStickY !== 0) {
                    if (this.followedDroneName) {
                        // Rotate around drone
                        this.rotateAroundDrone(rightStickX * rotationSpeed, rightStickY * rotationSpeed);
                    } else {
                        // Normal camera rotation
                        this.camera.rotation.y += rightStickX * rotationSpeed;
                        this.camera.rotation.x += rightStickY * rotationSpeed;
                        this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
                        
                        const direction = this.camera.getDirection(BABYLON.Vector3.Forward());
                        this.camera.target = this.camera.position.add(direction);
                    }
                }

                break;
            }
        });

        window.addEventListener("gamepadconnected", (e) => {
            console.log(`Gamepad connected: ${e.gamepad.id}`);
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            console.log(`Gamepad disconnected: ${e.gamepad.id}`);
        });
    }

    private getForwardDirection(): BABYLON.Vector3 {
        const yaw = this.camera.rotation.y;
        return new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    }

    private getRightDirection(): BABYLON.Vector3 {
        const yaw = this.camera.rotation.y;
        return new BABYLON.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    }

    private rotateAroundDrone(deltaYaw: number, deltaPitch: number): void {
        if (!this.followedDroneName) return;
        
        // Create rotation quaternion for yaw rotation around Y-axis
        const yawRotation = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), deltaYaw);
        
        // Create rotation quaternion for pitch rotation around the camera's right axis
        const cameraRight = this.camera.getDirection(BABYLON.Vector3.Right());
        const pitchRotation = BABYLON.Quaternion.RotationAxis(cameraRight, deltaPitch);
        
        // Apply yaw rotation first, then pitch
        const rotatedByYaw = this.cameraRelativePosition.clone();
        rotatedByYaw.rotateByQuaternionAroundPointToRef(yawRotation, BABYLON.Vector3.Zero(), rotatedByYaw);
        
        const finalRotated = rotatedByYaw.clone();
        finalRotated.rotateByQuaternionAroundPointToRef(pitchRotation, BABYLON.Vector3.Zero(), finalRotated);
        
        this.cameraRelativePosition = finalRotated;
        
        // Maintain camera orientation to keep drone at same screen position
        this.camera.rotation.y += deltaYaw;
        this.camera.rotation.x += deltaPitch;
        this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));
        
        // Update relative target based on new camera orientation
        const direction = this.camera.getDirection(BABYLON.Vector3.Forward());
        this.cameraRelativeTarget = this.cameraRelativePosition.add(direction);
    }
    
    private toggleSimulation(): void {
        if (this.isSimulationRunning) {
            this.pause();
        } else {
            this.resume();
        }
    }

    public resetTime(): void {
        this.t = 0;
        console.log('Simulation time reset to 0');
    }

    public pause(): void {
        this.isSimulationRunning = false;
        this.toggleSimulationButton.textContent = 'Resume';
        this.toggleSimulationButton.classList.add('warning');
        console.log('Simulation paused');

        this.drones.forEach((drone) => {
            drone.rotorAnimation?.stop();
        });
    }

    public resume(): void {
        this.isSimulationRunning = true;
        this.toggleSimulationButton.textContent = 'Pause';
        this.toggleSimulationButton.classList.remove('warning');
        console.log('Simulation resumed');

        this.drones.forEach((drone) => {
            drone.rotorAnimation?.start(true, 1.0, drone.rotorAnimation.from, drone.rotorAnimation.to, false);
        });
    }

    public despawnAll(): void {
        this.clearFollowedDrone();
        this.drones.forEach((drone, name) => {
            this.despawn(name);
        });
        console.log('All drones despawned');
    }

    private setupScene(): void {
        this.camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 3, -8), this.scene);
        this.camera.attachControl(this.canvas, true);
        
        // Remove default camera inputs to prevent conflicts
        this.camera.inputs.removeByType("FreeCameraKeyboardMoveInput");
        this.camera.inputs.removeByType("FreeCameraMouseInput");
        this.camera.inputs.removeByType("FreeCameraGamepadInput");
        this.camera.inputs.removeByType("FreeCameraTouchInput");

        const light = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(0, -1, 0), this.scene);
        light.position = new BABYLON.Vector3(20, 40, 20);
        light.intensity = 7;
        light.shadowEnabled = true;
        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);

        const gridMaterial = new GridMaterial("gridMaterial", this.scene);
        gridMaterial.majorUnitFrequency = 5;
        gridMaterial.minorUnitVisibility = 0.45;
        gridMaterial.gridRatio = 1;
        gridMaterial.backFaceCulling = false;
        gridMaterial.mainColor = new BABYLON.Color3(1, 1, 1);
        gridMaterial.lineColor = new BABYLON.Color3(1.0, 1.0, 1.0);
        gridMaterial.opacity = 0.98;

        const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, this.scene);
        ground.material = gridMaterial;

        const shadowGround = BABYLON.MeshBuilder.CreateGround("shadowGround", { width: 200, height: 200 }, this.scene);
        const shadowMaterial = new ShadowOnlyMaterial("shadowOnly", this.scene);
        shadowMaterial.alpha = 0.9;
        shadowGround.material = shadowMaterial;
        shadowGround.receiveShadows = true;
        shadowGround.position.y = 0.00;

        this.shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
        this.shadowGenerator.useBlurExponentialShadowMap = true;
        this.shadowGenerator.blurKernel = 32;

        this.createOvalTrack();

        this.setupCameraKeyboardControl();
        this.setupGamepadControl();
        this.setupMouseClickHandler();
        this.setupCustomCameraControls();
        this.setupMouseWheel();

        console.log("Scene setup completed");
    }

    private createOvalTrack(): void {
        const radius = this.trackScale * 0.25 / Math.PI;
        const straightLength = this.trackScale * 0.25;
        const trackHeight = 0;
        const numPoints = 100;
        const mainColor = new BABYLON.Color3(1, 1, 0);

        const points: BABYLON.Vector3[] = [];

        for (let i = 0; i <= numPoints; i++) {
            const angle = (Math.PI * i) / numPoints;
            const x = -radius * Math.cos(angle);
            const z = -straightLength / 2 - radius * Math.sin(angle);
            points.push(new BABYLON.Vector3(x, trackHeight, z));
        }

        points.push(new BABYLON.Vector3(radius, trackHeight, straightLength / 2));

        for (let i = 0; i <= numPoints; i++) {
            const angle = (Math.PI * i) / numPoints;
            const x = radius * Math.cos(angle);
            const z = straightLength / 2 + radius * Math.sin(angle);
            points.push(new BABYLON.Vector3(x, trackHeight, z));
        }

        points.push(new BABYLON.Vector3(-radius, trackHeight, -straightLength / 2));

        const trackLine = BABYLON.MeshBuilder.CreateLines("trackLine", {
            points: points
        }, this.scene);
        trackLine.color = mainColor;

        const originPoints = new Array<BABYLON.Vector3>();
        originPoints.push(new BABYLON.Vector3(-radius, trackHeight, straightLength / 2 - this.trackScale * 0.05));
        originPoints.push(new BABYLON.Vector3(-radius, trackHeight + 3, straightLength / 2 - this.trackScale * 0.05));
        const originLine = BABYLON.MeshBuilder.CreateLines("originLine", {
            points: originPoints
        }, this.scene);
        originLine.color = new BABYLON.Color3(1, 1, 0);

    }

    public setCameraPosition(x: number, y: number, z: number): void {
        this.camera.position = new BABYLON.Vector3(x, y, z);
    }

    public setCameraRotation(x: number, y: number, z: number): void {
        this.camera.rotation = new BABYLON.Vector3(x, y, z);
    }

    private loadCodeFromHash(): void {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const compressedCode = atob(hash);
            const code = decompressUrlSafe(compressedCode);
            if (code) {
                this.editor.setValue(code);
                console.log('Code loaded from URL hash');
            } else {
                console.error('Failed to decompress code from URL hash');
            }
        }
    }

    private updateHashFromCode(): void {
        if (!this.codeChanged) return; // Skip update if no changes

        const code = this.editor.getValue();
        const compressedCode = compressUrlSafe(code);
        const hash = btoa(compressedCode);
        window.location.hash = hash;

        this.codeChanged = false; // Reset flag after update
    }


    private setupCodeEditor(): void {

        monaco.editor.defineTheme('myTheme', {
            base: 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                "editor.background": '#00000011',
                "focusBorder": "#000000",
            }
        })

        monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
            target: monaco.languages.typescript.ScriptTarget.ES2015,
            allowNonTsExtensions: true
        });

        this.editor = monaco.editor.create(this.editorContainer, {
            value: defaultCode,
            language: 'javascript',
            theme: 'myTheme',
            minimap: { enabled: false },
        });

        this.editor.onDidChangeModelContent(() => {
            this.codeChanged = true;
        });

        this.toggleButton = document.getElementById('toggle') as HTMLButtonElement;
        this.runButton = document.getElementById('run') as HTMLButtonElement;

        this.runButton.addEventListener('click', () => this.runCode());
        this.toggleButton.addEventListener('click', () => this.toggleEditorVisibility());

        this.loadCodeFromHash();
        setInterval(() => this.updateHashFromCode(), 1000);

    }

    private toggleEditorVisibility(): void {
        this.editorVisible = !this.editorVisible;
        if (this.editorVisible) {
            this.editorContainer.style.transform = 'translateX(0)';
            this.toggleButton.textContent = 'Hide Code';
        } else {
            this.editorContainer.style.transform = 'translateX(-100%)';
            this.toggleButton.textContent = 'Show Code';
        }
    }

    private runCode(): void {
        const code = this.editor.getValue();
        try {
            console.log("Executing user code:");
            console.log(code);
            window.simulator = this;
            new Function('simulator', code)(this);
            console.log("User code executed successfully");
        } catch (error) {
            console.error('Code execution error:', error);
        }
    }

    private async loadDroneModel(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.droneTemplate) {
                resolve();
                return;
            }

            BABYLON.SceneLoader.ImportMesh("", "model/", "drone.glb", this.scene, (meshes) => {
                if (meshes.length > 0) {
                    this.droneTemplate = meshes[0] as BABYLON.Mesh;
                    this.droneTemplate.scaling = new BABYLON.Vector3(5, 5, 5);
                    this.droneTemplate.setEnabled(false);

                    const boundingBox = this.droneTemplate.getBoundingInfo().boundingBox;
                    const size = boundingBox.maximumWorld.subtract(boundingBox.minimumWorld);
                    console.log("Drone model size:", size);

                    console.log("Drone model loaded successfully");
                    resolve();
                } else {
                    console.error("Failed to load drone model");
                    reject(new Error("No meshes were loaded"));
                }
            }, null, (scene, message) => {
                console.error("Error loading drone model:", message);
                reject(new Error(message));
            });
        });
    }

    private createRotorAnimation(droneName: string): BABYLON.AnimationGroup {
        const rotorAnimation = new BABYLON.AnimationGroup("rotorAnimation");
        const rotorTransformNodes = [
            this.scene.getTransformNodeByName(`drone_${droneName}.Drone.Rotors.Rotor1`),
            this.scene.getTransformNodeByName(`drone_${droneName}.Drone.Rotors.Rotor2`),
            this.scene.getTransformNodeByName(`drone_${droneName}.Drone.Rotors.Rotor3`),
            this.scene.getTransformNodeByName(`drone_${droneName}.Drone.Rotors.Rotor4`)
        ];

        if (rotorTransformNodes) {
            rotorTransformNodes.forEach((rotor, index) => {
                const animation = new BABYLON.Animation("propellerAnimation" + index, "rotation", 60, BABYLON.Animation.ANIMATIONTYPE_VECTOR3, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
                const keys = [];
                keys.push({
                    frame: 0,
                    value: new BABYLON.Vector3(0, 0, 0)
                });
                keys.push({
                    frame: 7,
                    value: new BABYLON.Vector3(0, 0, 2 * Math.PI)
                });
                animation.setKeys(keys);
                rotorAnimation.addTargetedAnimation(animation, rotor);
            });
        }

        return rotorAnimation;
    }

    public async spawn(droneName: string, controller: (state: DroneState) => ControlInput, initialState?: Partial<DroneState>): Promise<void> {
        if (this.drones.has(droneName)) {
            console.log(`Drone ${droneName} already exists. Despawning and respawning.`);
            this.despawn(droneName);
        }

        try {
            await this.loadDroneModel();

            if (!this.droneTemplate) {
                throw new Error("Drone template is not loaded");
            }

            const droneMesh = this.droneTemplate.clone(`drone_${droneName}`);
            droneMesh.setEnabled(true);
            this.shadowGenerator.addShadowCaster(droneMesh);

            const rotorAnimation = this.createRotorAnimation(droneName);

            if (this.isSimulationRunning) {
                rotorAnimation.start(true, 1.0);
            }

            let state: DroneState = {
                position: initialState?.position || new BABYLON.Vector3(0, 0, 0),
                rotationQuaternion: BABYLON.Quaternion.Identity(),
                velocity: initialState?.velocity || new BABYLON.Vector3(0, 0, 0),
                angularVelocity: initialState?.angularVelocity || new BABYLON.Vector3(0, 0, 0)
            };
            const dynamicSystem = this.buildDroneDynamicSystem(state);
            const label = this.createDroneLabel(droneName);

            const drone: Drone = {
                mesh: droneMesh,
                controller: controller,
                dynamicSystem: dynamicSystem,
                state: state,
                label: label,
                rotorAnimation: rotorAnimation
            };

            drone.mesh.position = drone.state.position;
            drone.mesh.rotationQuaternion = drone.state.rotationQuaternion;
            this.drones.set(droneName, drone);

            console.log(`Drone ${droneName} spawned at position:`, drone.state.position);
            console.log(`Initial state: ${JSON.stringify(drone.state)}`);
        } catch (error) {
            console.error(`Failed to spawn drone ${droneName}:`, error);
        }
    }
    private createDroneLabel(droneName: string): BABYLON.Mesh {
        return this.createOrUpdateDroneLabel(droneName, droneName, "yellow", "rgba(0, 0, 0, 0.5)");
    }

    private updateDroneLabel(drone: Drone): void {
        const droneName = drone.mesh.name.replace('drone_', '');
        let labelText: string;
        let textColor: string;
        let backgroundColor: string;
        
        if (drone.isStopped && drone.stopReason) {
            labelText = `${droneName}\n${drone.stopReason}`;
            textColor = "red";
            backgroundColor = "rgba(139, 0, 0, 0.5)";
        } else if (this.followedDroneName === droneName) {
            labelText = droneName;
            textColor = "white";
            backgroundColor = "rgba(0, 0, 0, 0.5)";
        } else {
            labelText = droneName;
            textColor = "yellow";
            backgroundColor = "rgba(0, 0, 0, 0.5)";
        }
        
        drone.label = this.createOrUpdateDroneLabel(droneName, labelText, textColor, backgroundColor, drone.label);
    }

    public despawn(droneName: string): void {
        const drone = this.drones.get(droneName);
        if (drone) {
            if (this.followedDroneName === droneName) {
                this.clearFollowedDrone();
            }
            drone.label.dispose();
            drone.mesh.dispose();
            this.drones.delete(droneName);
            console.log(`Drone ${droneName} despawned.`);
        } else {
            console.warn(`Attempt to despawn non-existent drone ${droneName}.`);
        }
    }

    private buildDroneDynamicSystem(initialState: DroneState): DynamicSystem {
        const g = 9.81;
        const m = 1; // for simplicity, not the actual mass of the drone
        const Ixx = 1.5; // for imitating AirSim 
        const Iyy = 2.0; // randomly chosen
        const Izz = 1.5; // for imitating AirSim 
        const Cd = 0.001 * 0; // for simplicity
        const droneDynamics = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            const [px, py, pz, vx, vy, vz, qx, qy, qz, qw, p, q, r] = x;
            const [thrust, tau_x, tau_y, tau_z] = u;

            const quaternion = new BABYLON.Quaternion(qx, qy, qz, qw);
            const rotationMatrix = BABYLON.Matrix.Zero();
            quaternion.toRotationMatrix(rotationMatrix);
            const invRotationMatrix = BABYLON.Matrix.Zero();
            const inverseRotationQuaternion = quaternion.conjugate();
            inverseRotationQuaternion.toRotationMatrix(invRotationMatrix);
            const thrustWorld = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, thrust, 0), rotationMatrix);

            const dpx = vx;
            const dpy = vy;
            const dpz = vz;

            const localNegativeYAxis = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Up().negate(), invRotationMatrix);


            const dvx = (thrustWorld.x - Cd * vx * Math.abs(vx)) / m;
            const dvy = (thrustWorld.y - Cd * vy * Math.abs(vy)) / m - g;
            const dvz = (thrustWorld.z - Cd * vz * Math.abs(vz)) / m;

            const omega = new BABYLON.Vector3(p, q, r);
            const dQuaternion = quaternion.multiply(new BABYLON.Quaternion(omega.x, omega.y, omega.z, 0)).scale(0.5);

            const dp = (tau_x + (Iyy - Izz) * q * r) / Ixx;
            const dq = (tau_y + (Izz - Ixx) * p * r) / Iyy;
            const dr = (tau_z + (Ixx - Iyy) * p * q) / Izz;

            return new Float64Array([dpx, dpy, dpz, dvx, dvy, dvz, dQuaternion.x, dQuaternion.y, dQuaternion.z, dQuaternion.w, dp, dq, dr]);
        };

        const droneOutput = (x: Float64Array, u: Float64Array, t: number): Float64Array => {
            return x;
        };

        const initialStateArray = new Float64Array([
            initialState.position.x, initialState.position.y, initialState.position.z,
            initialState.velocity.x, initialState.velocity.y, initialState.velocity.z,
            initialState.rotationQuaternion.x, initialState.rotationQuaternion.y, initialState.rotationQuaternion.z, initialState.rotationQuaternion.w,
            initialState.angularVelocity.x, initialState.angularVelocity.y, initialState.angularVelocity.z
        ]);
        const droneSystem = new DynamicSystem('drone', droneDynamics, droneOutput, false, initialStateArray);

        const Kp = [1, 4, 1];
        const Ki = [0, 0, 0];
        const Kd = [1.5 / 0.206, 0.1, 1.5 / 0.206];
        const T = 0.005;

        const A_pid = [
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0],
            [0, 0, 0, -1 / T, 0, 0],
            [0, 0, 0, 0, -1 / T, 0],
            [0, 0, 0, 0, 0, -1 / T]
        ];

        const B_pid = [
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
            [0, -1 / T / T, 0, 0],
            [0, 0, -1 / T / T, 0],
            [0, 0, 0, -1 / T / T]
        ];

        const C_pid = [
            [0, 0, 0, 0, 0, 0],
            [Ki[0], 0, 0, Kd[0], 0, 0],
            [0, Ki[1], 0, 0, Kd[1], 0],
            [0, 0, Ki[2], 0, 0, Kd[2]],

        ];

        const D_pid = [
            [1, 0, 0, 0],
            [0, Kp[0] + Kd[0] / T, 0, 0],
            [0, 0, Kp[1] + Kd[1] / T, 0],
            [0, 0, 0, Kp[2] + Kd[2] / T],
        ];

        const pidSystem = DynamicSystem.linearSystem(
            A_pid,
            B_pid,
            C_pid,
            D_pid,
            [0, 0, 0, 0, 0, 0]
        );

        const PK = DynamicSystem.series(pidSystem, droneSystem);
        const zeroI = new DynamicSystem("ZI",
            (x: Float64Array, u: Float64Array, t: number) => new Float64Array([]),
            (x: Float64Array, u: Float64Array, t: number) => {
                const quaternion = new BABYLON.Quaternion(u[0], u[1], u[2], u[3]);
                const invRotationMatrix = BABYLON.Matrix.Zero();
                const inverseRotationQuaternion = quaternion.conjugate();
                inverseRotationQuaternion.toRotationMatrix(invRotationMatrix);
                const upFromLocal = BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.Up(), invRotationMatrix);

                return new Float64Array([0, -Math.atan2(upFromLocal.z,upFromLocal.y), u[4], Math.atan2(upFromLocal.x,upFromLocal.y)]);
            },
            true, new Float64Array([]));

        return DynamicSystem.feedback(PK, zeroI, [6, 7, 8, 9, 11], [0, 1, 2, 3]);
    }

    private updateDroneState(drone: Drone, dt: number, t: number): void {
        if (drone.isStopped) {
            return;
        }

        let control: ControlInput = {};
        try {
            control = drone.controller(drone.state, t);
        } catch (error) {
            console.error(`Error in controller for drone ${drone.mesh.name}:`, error);
        }

        if (control.action === 'despawn') {
            console.log(`Drone ${drone.mesh.name} requested despawn: ${control.reason || 'No reason provided'}`);
            this.despawn(drone.mesh.name.replace('drone_', ''));
            return;
        }

        if (control.action === 'stop') {
            console.log(`Drone ${drone.mesh.name} requested stop: ${control.reason || 'No reason provided'}`);
            drone.isStopped = true;
            drone.stopReason = control.reason || 'Stopped by controller';
            this.updateDroneLabel(drone);
            drone.rotorAnimation?.stop();
            return;
        }

        const rollYawRatePitch = control.rollYawRatePitch || new BABYLON.Vector3(0, 0, 0);
        const throttle = control.throttle || 0;

        const inputVector = new Float64Array([
            throttle,
            rollYawRatePitch.x,
            rollYawRatePitch.y,
            rollYawRatePitch.z
        ]);

        const nstep = Math.ceil(dt / 0.005);
        const h = dt / nstep;
        for (let i = 0; i < nstep; i++) {
            drone.dynamicSystem.update(() => inputVector, 0 + h * i, h);
        }

        const newState = drone.dynamicSystem.getState().slice(6);

        drone.state.position = new BABYLON.Vector3(newState[0], newState[1], newState[2]);
        drone.state.velocity = new BABYLON.Vector3(newState[3], newState[4], newState[5]);
        drone.state.rotationQuaternion = new BABYLON.Quaternion(newState[6], newState[7], newState[8], newState[9]);
        drone.state.rotationQuaternion.normalize();
        drone.state.angularVelocity = new BABYLON.Vector3(newState[10], newState[11], newState[12]);

        drone.mesh.position = drone.state.position;
        drone.mesh.rotationQuaternion = drone.state.rotationQuaternion;

        const rotorMeshes = drone.mesh.getChildMeshes().filter(mesh => mesh.name.startsWith("Rotor"));
        rotorMeshes.forEach((rotor, index) => {
            const animation = this.scene.getAnimationGroupByName(`propellerAnimation${index}`);
            if (animation) {
                animation.speedRatio = 5 / this.propellerSpeed;
            }
        });

        if (drone.state.position.y < -10 || drone.state.position.y > 100) {
            console.log(`Drone ${drone.mesh.name} out of altitude range. Despawning.`);
            this.despawn(drone.mesh.name.replace('drone_', ''));
        }

        if (isNaN(drone.state.position.x) || isNaN(drone.state.position.y) || isNaN(drone.state.position.z)) {
            console.log(`Drone ${drone.mesh.name} has NaN position. Despawning.`);
            this.despawn(drone.mesh.name.replace('drone_', ''));
        }
    }

    public run(): void {
        let lastTime = Date.now();
        let frameCount = 0;
        let lastFPSUpdate = 0;

        this.engine.runRenderLoop(() => {
            const currentTime = Date.now();
            let dt = (currentTime - lastTime) / 1000;

            if (dt > 1 / 15) {
                    dt = 1 / 15;
            }

            lastTime = currentTime;
            if (this.isSimulationRunning) {
                let nstep = Math.ceil(dt / (1 / 60));
                for (let i = 0; i < nstep; i++) {
                    this.t += dt / nstep;
                    this.drones.forEach((drone, name) => {
                        this.updateDroneState(drone, dt / nstep, this.t);
                    });
                }
            }

            this.updateCameraFollowing(dt);

            // Update drone label positions and orientations
            this.drones.forEach((drone) => {
                const labelMesh = drone.label;
                const labelMeshSize = labelMesh.getBoundingInfo().boundingBox.extendSizeWorld;
                const cameraToLabel = drone.mesh.position.subtract(this.camera.position);
                const cameraForward = this.camera.getDirection(BABYLON.Vector3.Forward());
                const cameraUp = this.camera.getDirection(BABYLON.Vector3.Up());
                
                const depth = BABYLON.Vector3.Dot(cameraToLabel, cameraForward);
                
                labelMesh.rotation.x = this.camera.rotation.x;
                labelMesh.rotation.y = this.camera.rotation.y;
                labelMesh.rotation.z = this.camera.rotation.z;

                const baseScale = 0.02;
                const distanceScale = Math.abs(depth) * baseScale;
                const screenOffset = distanceScale * (labelMeshSize.y*0.5 + 1) + 0.5;
                labelMesh.position = drone.mesh.position.add(cameraUp.scale(screenOffset));

                labelMesh.scaling = new BABYLON.Vector3(distanceScale, distanceScale, distanceScale);
            });

            this.scene.render();
            frameCount++;

            if (currentTime - lastFPSUpdate > 1000) {
                const fps = frameCount / ((currentTime - lastFPSUpdate) / 1000);
                this.fpsIndicator.innerText = `FPS: ${fps.toFixed(2)}`;
                frameCount = 0;
                lastFPSUpdate = currentTime;
            }
            this.timeIndicator.innerText = `Time: ${this.t.toFixed(2)} s`;
            this.droneCountIndicator.innerText = `# of Drones: ${this.drones.size}`;

            const cameraPosition = this.camera.position;
            this.cameraPositionIndicator.innerText = `x: ${cameraPosition.x.toFixed(2)}, y: ${cameraPosition.y.toFixed(2)}, z: ${cameraPosition.z.toFixed(2)}`;
            const cameraRotation = this.camera.rotation;
            this.cameraRotationIndicator.innerText = `x: ${cameraRotation.x.toFixed(2)}, y: ${cameraRotation.y.toFixed(2)}, z: ${cameraRotation.z.toFixed(2)}`;
        });

        window.addEventListener('resize', () => {
            this.engine.resize();
            if (this.editor) {
                this.editor.layout();
            }
        });

        console.log("Render loop started");
    }

    /**
     * Updates camera position to follow the selected drone
     */
    private updateCameraFollowing(dt: number): void {
        if (!this.followedDroneName || !this.drones.has(this.followedDroneName)) {
            return;
        }

        const followedDrone = this.drones.get(this.followedDroneName)!;
        const dronePosition = followedDrone.state.position;
        
        // Maintain relative position from drone
        this.camera.position = dronePosition.add(this.cameraRelativePosition);
        this.camera.target = dronePosition.add(this.cameraRelativeTarget);
    }
}

const canvas = document.getElementById('renderCanvas');
if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Element with id 'renderCanvas' is not an HTMLCanvasElement or not found.");
}
const editorContainer = document.getElementById('editorContainer');
if (!editorContainer) {
    throw new Error("Element with id 'editorContainer' not found.");
}
const simulator = new DroneSimulator(canvas, editorContainer);
simulator.run();
