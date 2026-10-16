import { Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, MeshLambertMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2 } from 'three';

function surfaceNoise(horizontal: number, vertical: number, period: number): number {
  const column = Math.floor(horizontal), row = Math.floor(vertical);
  const blendX = horizontal - column, blendY = vertical - row;
  const smoothX = blendX * blendX * (3 - 2 * blendX), smoothY = blendY * blendY * (3 - 2 * blendY);
  const sample = (offsetX: number, offsetY: number): number => {
    let value = Math.imul((column + offsetX) % period,374761393) + Math.imul((row + offsetY) % period,668265263);
    value = Math.imul(value ^ value >>> 13,1274126177);
    return ((value ^ value >>> 16) >>> 0) / 4294967295;
  };
  const lower = sample(0,0) * (1 - smoothX) + sample(1,0) * smoothX;
  const upper = sample(0,1) * (1 - smoothX) + sample(1,1) * smoothX;
  return lower * (1 - smoothY) + upper * smoothY;
}

function surfaceTexture(kind: 'paint' | 'asphalt' | 'plaster' | 'concrete', size = 256): DataTexture {
  const pixels = new Uint8Array(size * size * 4);
  let seed = 71397;
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 4294967296;
    const cloud = Math.sin(column * .055 + Math.sin(row * .031)) * Math.sin(row * .043 + column * .013);
    const streak = Math.max(0, Math.sin(column * .23) + Math.sin(column * .053) - 1.1) * (.4 + .6 * row / size);
    let value = kind === 'paint' ? 218 + noise * 20 + cloud * 7 : kind === 'asphalt' ? 153 + noise * 32 + cloud * 2 : 221 + noise * 13 + cloud * 8 - streak * 17;
    if (kind === 'plaster') {
      const mottling = surfaceNoise(column / size * 6,row / size * 6,6);
      const runoff = surfaceNoise(column / size * 24,row / size * 3,24);
      value = 211 + noise * 5 + mottling * 28 - Math.max(0,.55 - runoff) * 62;
    }
    if (kind === 'asphalt' && noise > .97) value += 40;
    const offset = (row * size + column) * 4;
    pixels[offset] = value; pixels[offset + 1] = value; pixels[offset + 2] = value - (kind === 'plaster' ? 6 : 0); pixels[offset + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.wrapS = texture.wrapT = RepeatWrapping; texture.anisotropy = 8; texture.needsUpdate = true;
  return texture;
}

export function surfaceNormals(source: DataTexture): DataTexture {
  const { width, height, data } = source.image;
  const pixels = new Uint8Array(width * height * 4);
  const sample = (column: number, row: number): number => Number(data[((row + height) % height * width + (column + width) % width) * 4]) / 255;
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const horizontal = (sample(column - 1,row) - sample(column + 1,row)) * 2;
    const vertical = (sample(column,row - 1) - sample(column,row + 1)) * 2;
    const length = Math.hypot(horizontal,vertical,1), offset = (row * width + column) * 4;
    pixels[offset] = Math.round((horizontal / length * .5 + .5) * 255);
    pixels[offset + 1] = Math.round((vertical / length * .5 + .5) * 255);
    pixels[offset + 2] = Math.round((1 / length * .5 + .5) * 255); pixels[offset + 3] = 255;
  }
  const normal = new DataTexture(pixels,width,height,RGBAFormat);
  normal.magFilter = LinearFilter; normal.minFilter = LinearMipmapLinearFilter; normal.generateMipmaps = true;
  normal.wrapS = normal.wrapT = RepeatWrapping; normal.repeat.copy(source.repeat); normal.anisotropy = 4; normal.needsUpdate = true;
  return normal;
}

const armorTexture = surfaceTexture('paint');
export const armorPaint = new MeshStandardMaterial({ map: armorTexture, normalMap: surfaceNormals(armorTexture), normalScale: new Vector2(.22,.22), roughness: .78, metalness: .08 });
armorPaint.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 armorPoint;').replace('#include <begin_vertex>', '#include <begin_vertex>\narmorPoint = position;\n#ifdef USE_INSTANCING\narmorPoint = (instanceMatrix * vec4(position, 1.)).xyz;\n#endif');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 armorPoint;').replace('#include <color_fragment>', `#include <color_fragment>
    float camo = sin(armorPoint.x * 2.9 + sin(armorPoint.z * 1.8) * 2.1) + cos(armorPoint.z * 2.3 + armorPoint.y * 1.3);
    diffuseColor.rgb *= mix(0.4, 1.04, smoothstep(-0.6, -0.35, camo));
    float brown = sin(armorPoint.z * 1.9 - armorPoint.x * 2.6 + sin(armorPoint.y * 2.)) + cos(armorPoint.x * 3.1);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.64, .49, .37), smoothstep(.8, 1.05, brown) * .8);
    float dust = (1. - smoothstep(0.65, 1.75, armorPoint.y)) * 0.23;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.22, 0.16), dust);`);
};
armorPaint.customProgramCacheKey = () => 'leopard-weathered-paint-v1';
export const bareSteel = new MeshStandardMaterial({ color: 0x8f948b, map: armorTexture, roughness: .37, metalness: .86 });
export const blackRubber = new MeshStandardMaterial({ roughness: .94, metalness: .015, color: 0x252b2a });
export const lensGlass = new MeshStandardMaterial({ color: 0x367079, roughness: .12, metalness: .5 });
export const concrete = new MeshStandardMaterial({ map: surfaceTexture('concrete'), roughness: .96, metalness: 0, envMapIntensity: 0 });
const plasterTexture = surfaceTexture('plaster');
export const agedPlaster = new MeshStandardMaterial({ map: plasterTexture, normalMap: surfaceNormals(plasterTexture), normalScale: new Vector2(.16,.16), roughness: .94, envMapIntensity: 0 });
export const oxidizedMetal = new MeshStandardMaterial({ map: armorTexture, roughness: .65, metalness: .46 });

function glazingTexture(): DataTexture {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
    const reflection = .65 + Math.pow(row / (size - 1),1.6) * .22;
    const blurredReflection = .97 + Math.cos(column / size * Math.PI * 3) * .03;
    const pane = column < size / 2 ? .94 : 1;
    const value = reflection * blurredReflection * pane, offset = (row * size + column) * 4;
    pixels[offset] = 197 * value; pixels[offset + 1] = 211 * value; pixels[offset + 2] = 215 * value; pixels[offset + 3] = 255;
  }
  const texture = new DataTexture(pixels,size,size,RGBAFormat);
  texture.colorSpace = SRGBColorSpace; texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

export const streetGlass = new MeshStandardMaterial({ color: 0xb6c1c4, map: glazingTexture(), roughness: .38, metalness: .12, envMapIntensity: .2 });
export const awningCloth = new MeshStandardMaterial({ roughness: 1, envMapIntensity: 0 });
export const distantFacade = new MeshLambertMaterial({ color: 0xd0d6d3 });

function matteEnvironment(material: MeshStandardMaterial): MeshStandardMaterial {
  material.onBeforeCompile = shader => {
    shader.vertexShader = '#undef USE_ENVMAP\n' + shader.vertexShader;
    shader.fragmentShader = '#undef USE_ENVMAP\n' + shader.fragmentShader;
  };
  material.customProgramCacheKey = () => 'matte-no-studio-reflection-v1';
  return material;
}
matteEnvironment(concrete); matteEnvironment(agedPlaster); matteEnvironment(awningCloth);

export function streetAsphalt(): MeshStandardMaterial {
  const texture = surfaceTexture('asphalt', 512); texture.repeat.set(75, 85);
  return matteEnvironment(new MeshStandardMaterial({ color: new Color(0x666966), map: texture, normalMap: surfaceNormals(texture), normalScale: new Vector2(.24,.24), roughness: .96, metalness: 0, envMapIntensity: 0 }));
}
