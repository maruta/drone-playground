import * as BABYLON from 'babylonjs';
import * as monaco from 'monaco-editor';

declare global {
    const BABYLON: typeof import('babylonjs');
    const monaco: typeof import('monaco-editor');
}
