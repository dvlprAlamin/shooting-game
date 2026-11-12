// Writes signboard.png into public/physics-scene.glb as the "sineboard" material's image, byte for byte
// (so an optimized PNG stays optimized). Nothing else in the GLB changes. No dependencies.
//
//   node apps/client/resources/signboard/embed.mjs
import fs from 'fs';
import path from 'path';

const GLB = path.resolve(import.meta.dirname, '../../public/physics-scene.glb');
const IMAGE = path.join(import.meta.dirname, 'signboard.png');
const MATERIAL = 'sineboard';

// Swap one image's bytes in a GLB, shifting the buffer views after it.
function replaceImage(glb, materialName, bytes, mimeType) {
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    const binHeader = 20 + jsonLength;
    const bin = glb.subarray(binHeader + 8, binHeader + 8 + glb.readUInt32LE(binHeader));

    const material = json.materials.find(m => m.name === materialName);
    const texture = json.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    const image = json.images[texture.source];
    const target = image.bufferView;

    const pad4 = n => (n + 3) & ~3;
    const views = json.bufferViews.map((view, i) => ({ i, view })).sort((a, b) => (a.view.byteOffset || 0) - (b.view.byteOffset || 0));
    const chunks = [];
    let offset = 0;
    for (const { i, view } of views) {
        const data = i === target ? bytes : bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
        const start = pad4(offset);
        if (start > offset) chunks.push(Buffer.alloc(start - offset));
        chunks.push(data);
        view.byteOffset = start;
        view.byteLength = data.length;
        offset = start + data.length;
    }
    const newBin = Buffer.concat([...chunks, Buffer.alloc(pad4(offset) - offset)]);
    json.buffers[0].byteLength = newBin.length;
    image.mimeType = mimeType;

    let jsonBytes = Buffer.from(JSON.stringify(json));
    jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(pad4(jsonBytes.length) - jsonBytes.length, 0x20)]);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + newBin.length, 8);
    const chunkHeader = (length, type) => {
        const b = Buffer.alloc(8);
        b.writeUInt32LE(length, 0);
        b.writeUInt32LE(type, 4);
        return b;
    };
    return Buffer.concat([header, chunkHeader(jsonBytes.length, 0x4e4f534a), jsonBytes, chunkHeader(newBin.length, 0x004e4942), newBin]);
}

const png = fs.readFileSync(IMAGE);
fs.writeFileSync(GLB, replaceImage(fs.readFileSync(GLB), MATERIAL, png, 'image/png'));
console.log(`wrote signboard.png (${(png.length / 1024).toFixed(0)} KB) into ${path.relative(process.cwd(), GLB)}`);
