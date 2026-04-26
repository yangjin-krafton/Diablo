import * as THREE from 'three';

const _white = new THREE.Color(0xffffff);

export function applyMaterialPreset(root, preset = {}) {
    if (!root) return;
    root.traverse((obj) => {
        if (!obj.isMesh || !obj.material) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (let i = 0; i < materials.length; i++) {
            const material = ensureEditableMaterial(materials[i]);
            applyPresetToMaterial(material, preset);
            if (Array.isArray(obj.material)) obj.material[i] = material;
            else obj.material = material;
        }
    });
}

function ensureEditableMaterial(material) {
    if (material.userData?.diabloEditable) return material;

    const editable = material.clone();
    editable.userData.diabloEditable = true;
    editable.userData.baseColor = material.color?.clone?.() ?? _white.clone();
    editable.userData.baseEmissive = material.emissive?.clone?.() ?? new THREE.Color(0x000000);
    return editable;
}

function applyPresetToMaterial(material, preset) {
    if (material.color) {
        const tint = new THREE.Color(preset.tint ?? '#ffffff');
        const base = material.userData.baseColor ?? _white;
        material.color.copy(base).multiply(tint);
    }

    if ('roughness' in material && preset.roughness !== undefined) {
        material.roughness = preset.roughness;
    }
    if ('metalness' in material && preset.metalness !== undefined) {
        material.metalness = preset.metalness;
    }
    if (material.emissive) {
        material.emissive.set(preset.emissive ?? '#000000');
    }
    if ('emissiveIntensity' in material && preset.emissiveIntensity !== undefined) {
        material.emissiveIntensity = preset.emissiveIntensity;
    }
    if ('envMapIntensity' in material && preset.envMapIntensity !== undefined) {
        material.envMapIntensity = preset.envMapIntensity;
    }
    if (preset.indirectLightIntensity !== undefined) {
        applyIndirectLightScale(material, preset.indirectLightIntensity);
    }
    if (preset.opacity !== undefined) {
        material.opacity = preset.opacity;
        material.transparent = preset.opacity < 1;
        material.depthWrite = preset.opacity >= 1;
    }
    if ('wireframe' in material && preset.wireframe !== undefined) {
        material.wireframe = preset.wireframe;
    }
    if ('toneMapped' in material && preset.toneMapped !== undefined) {
        material.toneMapped = preset.toneMapped;
    }
    material.needsUpdate = true;
}

function applyIndirectLightScale(material, scale) {
    if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) return;

    const clamped = Math.max(0, Math.min(1, scale));
    material.userData.indirectLightIntensity = clamped;
    material.customProgramCacheKey = () => `indirectLight:${clamped.toFixed(3)}`;
    material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_end>',
            `
#include <lights_fragment_end>
reflectedLight.indirectDiffuse *= ${clamped.toFixed(3)};
reflectedLight.indirectSpecular *= ${clamped.toFixed(3)};
`,
        );
    };
}
