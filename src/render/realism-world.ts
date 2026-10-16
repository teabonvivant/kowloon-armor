import * as THREE from 'three';
import type { Obstacle, WorldData } from './world';
import { GeometryBatch, createSignMaterial, unitPlane } from './materials';
import { agedPlaster, awningCloth, blackRubber, concrete, distantFacade, oxidizedMetal, streetAsphalt, streetGlass } from './realism-materials';

const storefronts = [
  { name: '永安茶餐廳', english: 'WING ON CAFE', color: '#344b40', ink: '#e9ddba' },
  { name: '建成藥房', english: 'KIN SHING DISPENSARY', color: '#e2d9bc', ink: '#843f37' },
  { name: '新記五金', english: 'SAN KEE HARDWARE', color: '#454b4b', ink: '#e6d8b3' },
  { name: '德昌電器', english: 'TAK CHEONG ELECTRIC', color: '#644c40', ink: '#f0dfb9' },
  { name: '聯興辦館', english: 'LUEN HING STORE', color: '#474c42', ink: '#ece4c9' },
  { name: '南華洋服', english: 'NAM WAH TAILOR', color: '#d5c7a9', ink: '#344546' },
] as const;

function sign(group: THREE.Group, text: string, subtitle: string, background: string, foreground: string, position: [number,number,number], width: number, height: number, vertical = false): void {
  const material = createSignMaterial({ text, subtitle, background, foreground, vertical });
  material.emissiveIntensity = .035;
  const mesh = new THREE.Mesh(unitPlane, material); mesh.position.set(...position); mesh.scale.set(width,height,1); mesh.rotation.y = Math.PI; mesh.castShadow = true; group.add(mesh);
}

function building(frontX: number, frontZ: number, width: number, depth: number, height: number, yaw: number, index: number, obstacles: Obstacle[]): THREE.Group {
  const group = new THREE.Group(); group.name = `street-front-${index}`; group.position.set(frontX,0,frontZ); group.rotation.y = yaw;
  const walls = new GeometryBatch(agedPlaster), structure = new GeometryBatch(concrete), frames = new GeometryBatch(oxidizedMetal), glass = new GeometryBatch(streetGlass), dark = new GeometryBatch(blackRubber);
  const palettes = [0xb6b0a3,0x91a6a2,0xa5a7a3,0xb5a395,0x8e9b9e,0xc0b6a6];
  const tint = palettes[index % palettes.length] ?? 0xa9aaa1;
  const architecture = index % 4, floorStep = [3.1,3.35,3.0,3.2][architecture]!;
  walls.box({ position: [0,height / 2,depth / 2 + .545], scale: [width,height,depth - .65] }, tint);
  structure.box({ position: [0,.16,depth / 2 - .8], scale: [width + .35,.32,depth + 2.3] }, 0x91968e);
  structure.box({ position: [0,height + .26,depth / 2], scale: [width + .18,.52,depth] }, tint);
  structure.box({ position: [0,3.8,-.19], scale: [width + .36,.3,1.48] }, 0xb2b2a2);
  const bays = Math.max(2, Math.round(width / 3.5)), bayWidth = width / bays;
  const bayWeights = Array.from({ length: bays },(_,bay) => [1.1,.88,1.02,1,1.16,.9][(bay + index) % 6]!);
  const weightTotal = bayWeights.reduce((sum,weight) => sum + weight,0);
  const floors = Math.floor((height - 4.5) / floorStep), roofBand = height - 4 - floors * floorStep;
  walls.box({ position: [0,height - roofBand / 2,.52], scale: [width,roofBand,.64] }, tint);
  walls.box({ position: [0,3.62,.52], scale: [width,.76,.64] }, tint);
  let bayStart = -width / 2;
  for (let bay = 0; bay < bays; bay++) {
    const baySpan = width * bayWeights[bay]! / weightTotal, horizontal = bayStart + baySpan / 2;
    bayStart += baySpan;
    const closed = (index * 3 + bay * 5) % 7 < 3;
    dark.box({ position: [horizontal,1.77,.76], scale: [baySpan - .27,3.18,.06] }, 0xb3bcb6);
    walls.box({ position: [horizontal,.38,.51], scale: [baySpan,.76,.64] }, tint);
    if (closed) {
      frames.box({ position: [horizontal,1.76,.4], scale: [baySpan - .41,2.84,.08] }, index % 2 ? 0x737c79 : 0x92948b);
      for (let slat = 0; slat < 20; slat++) frames.box({ position: [horizontal,.4 + slat * .14,.35], scale: [baySpan - .44,.018,.016] }, 0x5b655c);
      frames.box({ position: [horizontal,.85,.32], scale: [.18,.24,.06] }, 0x404a45);
      frames.box({ position: [horizontal,.46,.29], scale: [.29,.035,.045] }, 0xb5b1a0);
    } else {
      glass.box({ position: [horizontal,1.83,.63], scale: [baySpan - .48,2.56,.025] }, 0x9daaaa);
      frames.box({ position: [horizontal,1.83,.59], scale: [.065,2.65,.045] }, 0xa6aaa5);
      structure.box({ position: [horizontal,.47,.35], scale: [baySpan - .39,.44,.7] }, 0x6c7b70);
      for (const offset of [-.12,.12]) frames.box({ position: [horizontal + offset,1.52,.52], scale: [.025,.32,.045] }, 0xb7b9a8);
      frames.box({ position: [horizontal,.55,.48], scale: [baySpan - .51,.15,.035] }, 0x8c978b);
    }
    structure.box({ position: [horizontal - baySpan / 2,1.8,.32], scale: [.31,3.6,.85] }, 0xb7b5a4);
    structure.box({ position: [horizontal - baySpan / 2,.5,.18], scale: [.36,.75,.69] }, 0x626f65);
    walls.box({ position: [horizontal,.69,.15], scale: [baySpan - .52,.21,.025] }, index % 2 ? 0x6e8a83 : 0xc2bbaa);
    for (let tile = 0; tile < 9; tile++) frames.box({ position: [horizontal - (baySpan - .52) / 2 + tile * (baySpan - .52) / 9,.69,.13], scale: [.012,.21,.007] }, 0x5a6962);
    for (let floor = 0; floor < floors; floor++) {
      const vertical = 4 + floorStep * (floor + .5), variant = ((Math.imul(bay + 1,73856093) ^ Math.imul(floor + 1,19349663) ^ Math.imul(index + 1,83492791)) >>> 0) % 9;
      const windowWidth = baySpan * (architecture === 1 ? .79 : variant === 2 ? .56 : .7), windowHeight = architecture === 3 ? 1.72 : 2.05;
      const pierWidth = (baySpan - windowWidth) / 2, spandrel = (floorStep - windowHeight) / 2;
      const panelTint = architecture === 1 ? 0x78938f : architecture === 2 && bay % 3 === 1 ? 0x909690 : tint;
      for (const side of [-1,1]) {
        walls.box({ position: [horizontal + side * (windowWidth / 2 + pierWidth / 2),vertical,.52], scale: [pierWidth,floorStep,.64] }, tint);
        walls.box({ position: [horizontal,vertical + side * (windowHeight / 2 + spandrel / 2),.52], scale: [windowWidth,spandrel,.64] }, panelTint);
        structure.box({ position: [horizontal + side * (windowWidth / 2 + .035),vertical,.47], scale: [.07,windowHeight + .14,.55] }, 0x8f9690);
        structure.box({ position: [horizontal,vertical + side * (windowHeight / 2 + .035),.47], scale: [windowWidth,.07,.55] }, 0x8f9690);
      }
      dark.box({ position: [horizontal,vertical,.79], scale: [windowWidth,windowHeight,.04] }, 0xa6afa9);
      glass.box({ position: [horizontal,vertical,.68], scale: [windowWidth,windowHeight,.025] }, variant % 4 === 0 ? 0xbfc5bf : variant % 3 === 0 ? 0x8e9e9f : 0x718389);
      frames.box({ position: [horizontal,vertical,.62], scale: [.045,windowHeight,.04] }, 0xaeb6b1);
      frames.box({ position: [horizontal,vertical + .25,.62], scale: [windowWidth,.035,.04] }, 0xa0aba6);
      structure.box({ position: [horizontal,vertical - windowHeight / 2 - .085,.12], scale: [windowWidth + .2,.1,.5] }, tint);
      if (variant === 1 || variant === 4) {
        walls.box({ position: [horizontal + windowWidth * .29,vertical,.59], scale: [windowWidth * .35,windowHeight,.025] }, variant === 1 ? 0xb9af9c : 0x8a9188);
      }
      if (variant === 3 || variant === 7) {
        frames.box({ position: [horizontal + .45,vertical - .92,-.52], scale: [.88,.62,.7] }, 0xb9b9aa);
        dark.box({ position: [horizontal + .45,vertical - .92,-.88], scale: [.64,.42,.02] }, 0xa5b1a6);
        for (let vent = 0; vent < 5; vent++) frames.box({ position: [horizontal + .45,vertical - 1.08 + vent * .075,-.905], scale: [.61,.018,.015] }, 0x979e90);
        for (const offset of [.12,.76]) frames.box({ position: [horizontal + offset,vertical - 1.29,-.53], scale: [.04,.035,.69] }, 0x656e61);
        frames.cylinder({ position: [horizontal + .91,vertical - 1.32,-.36], scale: [.021,.77,.021] }, 0xa2a98f);
      }
      if (variant === 2) {
        structure.box({ position: [horizontal,vertical + windowHeight / 2 + .1,-.14], scale: [windowWidth + .25,.08,.7] }, tint);
        for (let bar = 0; bar < 5; bar++) frames.box({ position: [horizontal - windowWidth * .4 + bar * windowWidth * .2,vertical,.34], scale: [.025,windowHeight,.025] }, 0x52675e);
      }
      if (variant === 5) {
        for (let slat = 0; slat < 7; slat++) walls.box({ position: [horizontal,vertical + .65 - slat * .13,.55], scale: [windowWidth,.075,.04] }, 0xb7b39d);
      }
      if (architecture === 0 && floor < 3 || architecture === 2 && bay % 3 === 1 && floor < floors - 1) {
        structure.box({ position: [horizontal,vertical - 1.14,-.47], scale: [baySpan - .18,.12,1.1] }, tint);
        for (let rail = 0; rail < 7; rail++) frames.box({ position: [horizontal - baySpan * .4 + rail * baySpan * .13,vertical - .67,-.98], scale: [.03,.83,.03] }, 0x686e63);
        frames.box({ position: [horizontal,vertical - .26,-.98], scale: [baySpan - .3,.045,.045] }, 0x72796b);
        frames.cylinder({ position: [horizontal,vertical + .58,-.94], scale: [.018,baySpan * .8,.018], rotation: [0,0,Math.PI / 2] }, 0x9ea595);
      }
    }
  }
  for (let floor = 0; floor <= floors; floor++) {
    if (architecture === 0 && floor > 3) continue;
    structure.box({ position: [0,4 + floor * floorStep,.08], scale: [width,.12,architecture === 3 ? .8 : .38] }, architecture === 1 ? 0xabb3ad : 0x9b9e96);
  }
  for (const side of [-1,1]) {
    frames.cylinder({ position: [side * (width / 2 - .31),height / 2,-.25], scale: [.045,height,.045] }, 0x72796c);
    for (let floor = 0; floor < floors; floor++) structure.box({ position: [side * (width / 2 - .3),4.55 + floor * floorStep,-.31], scale: [.28,.07,.21] }, tint);
    const sideBays = Math.floor(depth / 3.6);
    for (let bay = 0; bay < sideBays; bay++) for (let floor = 0; floor < floors; floor++) {
      const along = 2.1 + bay * 3.5, vertical = 4 + floorStep * (floor + .5);
      structure.box({ position: [side * (width / 2 + .03),vertical,along], scale: [.16,2.17,2.4] }, 0x7b877c);
      glass.box({ position: [side * (width / 2 + .125),vertical,along], scale: [.05,1.94,2.19] }, (bay + floor + index) % 3 ? 0x9baaaa : 0xb7bcb4);
      frames.box({ position: [side * (width / 2 + .16),vertical,along], scale: [.035,1.94,.045] }, 0xb2baaa);
      structure.box({ position: [side * (width / 2 + .22),vertical - 1.1,along], scale: [.47,.12,2.5] }, tint);
      if ((bay + floor) % 4 === 0) frames.box({ position: [side * (width / 2 + .4),vertical - .84,along + .57], scale: [.6,.55,.8] }, 0xadb3a4);
    }
    for (let bay = 0; bay < sideBays; bay++) {
      const along = 2.1 + bay * 3.5;
      frames.box({ position: [side * (width / 2 + .1),1.55,along], scale: [.13,2.8,2.75] }, 0x67796b);
      for (let slat = 0; slat < 16; slat++) dark.box({ position: [side * (width / 2 + .18),.35 + slat * .15,along], scale: [.02,.015,2.65] }, 0xa5afa0);
    }
  }
  frames.box({ position: [-width / 2 + .42,2.05,-.43], scale: [.48,.68,.21] }, 0x8b9586);
  frames.box({ position: [-width / 2 + .42,3.05,-.33], scale: [.055,1.4,.055] }, 0x727c6d);
  for (const side of [-1,1]) {
    structure.box({ position: [side * (width / 2 - .18),height + .53,depth / 2], scale: [.18,.17,depth - .4] }, 0x727c6d);
    frames.box({ position: [side * width * .32,3.78,-.6], scale: [.06,.07,.84] }, 0x697566);
  }
  const awning = new GeometryBatch(awningCloth);
  for (let stripe = 0; stripe < Math.floor(width / .5); stripe++) {
    if (architecture === 1 || architecture === 3 && stripe > width * 1.1) continue;
    const damaged = index === 0 && stripe < 4;
    awning.box({ position: [-width / 2 + .25 + stripe * .5,damaged ? 3.02 : 3.27,-1.03], scale: [.5,.055,damaged ? 1.25 : 1.95], rotation: [damaged ? .42 : .13,0,0] }, architecture === 2 ? 0x757d79 : stripe % 2 ? 0x6d7b72 : 0xacae9d);
  }
  if (index === 0 || index === 3) {
    walls.box({ position: [-width * .36,2.02,-.235], scale: [1.35,1.6,.035] }, 0x62695f);
    for (let row = 0; row < 6; row++) for (let brick = 0; brick < 4; brick++) {
      if ((row + brick) % 7 === 0) continue;
      structure.box({ position: [-width * .36 - .47 + brick * .3 + row % 2 * .08,1.4 + row * .22,-.26], scale: [.26,.18,.028] }, (row + brick) % 3 ? 0x8c7660 : 0xa18d72);
    }
    for (let crack = 0; crack < 4; crack++) dark.box({ position: [-width * .36 + .55 + crack * .13,2.3 + crack * .19,-.28], scale: [.014,.3,.012], rotation: [0,0,crack % 2 ? .7 : -.3] }, 0x969b8d);
    for (const slope of [-.45,.45]) frames.box({ position: [width * .22,5.45,-.29], scale: [2.1,.13,.055], rotation: [0,0,slope] }, 0x99886d);
    for (let buckle = 0; buckle < 5; buckle++) frames.box({ position: [-width * .35,1.1 + buckle * .17,-.3 - buckle % 2 * .07], scale: [.97,.1,.03], rotation: [0,0,buckle % 2 ? .06 : -.03] }, 0x5c6c64);
    dark.box({ position: [-width * .3,.331,-.65], scale: [2.1,.009,.72] }, 0x7c8071);
  }
  for (let beam = 0; beam < bays; beam++) frames.box({ position: [-width / 2 + bayWidth * (beam + .5),3.31,-.7], scale: [.035,.05,1.2] }, 0x5d665a);
  const shop = index === 12 ? { name: '佐敦機電倉',english: 'JORDAN ELECTRICAL WORKS',color: '#6f6751',ink: '#e3d5b6' } : storefronts[index % storefronts.length]!;
  frames.box({ position: [0,3.72,-.9], scale: [width,.98,.1] }, 0x4a594a);
  for (const edge of [-1,1]) frames.box({ position: [0,3.72 + edge * .62,-.99], scale: [Math.min(width * .91,11.5) + .14,.045,.06] }, 0x9eaa92);
  sign(group,shop.name,shop.english,shop.color,shop.ink,[0,3.72,-.98],Math.min(width * .91,11.5),1.18);
  if (index < 2) sign(group,index === 0 ? '永安茶餐廳' : '建成藥房','',shop.color,shop.ink,[width / 2 - .85,7.45,-1.75],1.32,5.6,true);
  structure.box({ position: [width * .2,height + .64,depth * .65], scale: [width * .45,1.1,depth * .4] }, 0x91998e);
  if (index % 4 === 1) {
    walls.box({ position: [-width * .22,height + 1.55,depth * .62], scale: [width * .3,2.6,depth * .3] }, tint);
    structure.box({ position: [-width * .22,height + 2.91,depth * .62], scale: [width * .32,.18,depth * .32] }, 0x788478);
  }
  for (let tank = 0; tank < 2; tank++) {
    const horizontal = -width * .28 + tank * 1.95;
    structure.box({ position: [horizontal,height + .18,depth * .6], scale: [1.45,.3,1.45] }, 0x6f7b6b);
    frames.cylinder({ position: [horizontal,height + 1.04,depth * .6], scale: [.64,1.8,.64] }, 0x939b8c);
  }
  frames.cylinder({ position: [width * .34,height + .8,depth * .8], scale: [.15,1.2,.15] }, 0x838d7c);
  frames.cylinder({ position: [width * .34,height + 1.45,depth * .8], scale: [.28,.1,.28] }, 0x7b8674);
  walls.finish(group); structure.finish(group); frames.finish(group,false); glass.finish(group,false); dark.finish(group,false); awning.finish(group);
  const centre = new THREE.Vector3(0,0,depth / 2).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
  obstacles.push({ x: frontX + centre.x, z: frontZ + centre.z, halfX: Math.abs(Math.cos(yaw)) * width / 2 + Math.abs(Math.sin(yaw)) * depth / 2, halfZ: Math.abs(Math.sin(yaw)) * width / 2 + Math.abs(Math.cos(yaw)) * depth / 2,height });
  return group;
}

function roadSurface(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 2048;
  const context = canvas.getContext('2d');
  if (context) {
    const scaleX = 768 / 30, scaleZ = 2048 / 170;
    const rectangle = (x: number,z: number,width: number,depth: number): void => context.fillRect((x + 15) * scaleX,(z + 35) * scaleZ,width * scaleX,depth * scaleZ);
    let seed = 12779;
    const random = (): number => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (const side of [-1,1]) {
      const gradient = context.createLinearGradient(side < 0 ? 0 : 768,0,side < 0 ? 150 : 618,0);
      gradient.addColorStop(0,'rgba(26,33,31,.8)'); gradient.addColorStop(1,'rgba(26,33,31,0)'); context.fillStyle = gradient;
      context.fillRect(side < 0 ? 0 : 618,0,150,2048);
    }
    for (let patch = 0; patch < 22; patch++) {
      const horizontal = (5 + random() * 17) * scaleX, vertical = (13 + random() * 152) * scaleZ;
      const width = (1.2 + random() * 3.8) * scaleX, depth = (1 + random() * 10) * scaleZ;
      context.fillStyle = patch % 3 ? 'rgba(15,23,23,.18)' : 'rgba(115,120,112,.13)';
      context.beginPath(); context.moveTo(horizontal,vertical);
      context.lineTo(horizontal + width * .93,vertical + depth * .025);
      context.lineTo(horizontal + width,vertical + depth * .64);
      context.lineTo(horizontal + width * .88,vertical + depth);
      context.lineTo(horizontal - width * .035,vertical + depth * .96); context.closePath(); context.fill();
    }
    for (const [horizontal,along,radius] of [[-9.7,24,3],[-10,64,3.7],[9.8,14,2.6],[10,100,3.1]]) {
      const centreX = (horizontal! + 15) * scaleX, centreZ = (along! + 35) * scaleZ;
      context.save(); context.translate(centreX,centreZ); context.scale(scaleX,scaleZ);
      const sediment = context.createRadialGradient(0,0,.15,0,0,radius!);
      sediment.addColorStop(0,'rgba(173,160,136,.36)'); sediment.addColorStop(.45,'rgba(154,143,122,.2)'); sediment.addColorStop(1,'rgba(154,143,122,0)');
      context.fillStyle = sediment; context.fillRect(-radius!,-radius!,radius! * 2,radius! * 2);
      context.restore();
      for (let fragment = 0; fragment < 18; fragment++) {
        const angle = random() * Math.PI * 2, distance = random() * radius!;
        context.fillStyle = fragment % 3 ? 'rgba(167,156,135,.32)' : 'rgba(33,36,33,.33)';
        context.fillRect(centreX + Math.cos(angle) * distance * scaleX,centreZ + Math.sin(angle) * distance * scaleZ,2 + random() * 4,1 + random() * 3);
      }
    }
    for (const centre of [-5.7,-4.1,4.1,5.7]) {
      context.fillStyle = 'rgba(20,29,27,.18)'; rectangle(centre,-25,.24,152);
    }
    context.lineWidth = .75; context.strokeStyle = 'rgba(12,19,18,.48)';
    for (let crack = 0; crack < 60; crack++) {
      let horizontal = random() * 768, vertical = random() * 2048;
      context.beginPath(); context.moveTo(horizontal,vertical);
      for (let segment = 0; segment < 5; segment++) { horizontal += random() * 38 - 19; vertical += random() * 35; context.lineTo(horizontal,vertical); } context.stroke();
    }
    context.fillStyle = 'rgba(208,193,128,.76)';
    for (const side of [-1,1]) for (const offset of [0,.21]) {
      rectangle(side * 10.9 + offset,-25,.11,94); rectangle(side * 10.9 + offset,100,.11,31);
    }
    context.fillStyle = 'rgba(203,204,185,.72)';
    for (let position = -23; position < 130; position += 8) if (position < 66 || position > 102) rectangle(-.07,position,.14,3.4);
    for (const crossing of [70,97]) for (let stripe = -9; stripe < 10; stripe += 2) {
      context.fillStyle = 'rgba(211,196,142,.83)'; rectangle(stripe,crossing,1.1,2.8);
    }
    context.save();
    context.beginPath(); context.rect(5 * scaleX,113 * scaleZ,20 * scaleX,13 * scaleZ); context.clip();
    context.strokeStyle = 'rgba(204,175,90,.62)'; context.lineWidth = 2.6;
    for (let offset = -500; offset < 1100; offset += 85) {
      context.beginPath(); context.moveTo(offset,113 * scaleZ); context.lineTo(offset + 13 * scaleZ,126 * scaleZ); context.stroke();
      context.beginPath(); context.moveTo(offset,126 * scaleZ); context.lineTo(offset + 13 * scaleZ,113 * scaleZ); context.stroke();
    }
    context.restore();
    context.fillStyle = 'rgba(214,211,186,.65)'; rectangle(-10,66,9.6,.3); rectangle(.4,103,9.6,.3);
    for (const along of [24,54,114]) {
      const centre = 10 * scaleX, vertical = (along + 35) * scaleZ;
      context.beginPath(); context.moveTo(centre,vertical); context.lineTo(centre - 13,vertical + 22); context.lineTo(centre - 4,vertical + 22);
      context.lineTo(centre - 4,vertical + 48); context.lineTo(centre + 4,vertical + 48); context.lineTo(centre + 4,vertical + 22); context.lineTo(centre + 13,vertical + 22); context.closePath(); context.fill();
    }
    for (const along of [-12,32,61,109]) {
      const centre = 18.5 * scaleX, vertical = (along + 35) * scaleZ;
      context.fillStyle = 'rgba(20,29,28,.34)'; context.fillRect(centre - 20,vertical - 16,40,32);
      context.fillStyle = '#4c5650'; context.beginPath(); context.ellipse(centre,vertical,13,6,0,0,Math.PI * 2); context.fill();
      context.strokeStyle = '#7f8779'; context.lineWidth = .8;
      for (const radius of [4,8,12]) { context.beginPath(); context.ellipse(centre,vertical,radius,radius * .47,0,0,Math.PI * 2); context.stroke(); }
    }
    for (const side of [-1,1]) {
      for (let along = -20; along < 130; along += 14) {
        context.fillStyle = 'rgba(20,37,35,.17)'; rectangle(side * 10.2,along,.36,3.5);
      }
      const horizontal = (15 + side * 5.1) * scaleX;
      context.strokeStyle = 'rgba(15,24,23,.22)'; context.lineWidth = 4;
      context.beginPath(); context.moveTo(horizontal,100 * scaleZ); context.bezierCurveTo(horizontal,115 * scaleZ,horizontal + side * 100,123 * scaleZ,horizontal + side * 150,124 * scaleZ); context.stroke();
    }
    for (let spot = 0; spot < 12; spot++) {
      context.fillStyle = 'rgba(18,27,25,.16)'; context.beginPath();
      context.ellipse((15 + (spot % 2 ? -8 : 8) + random()) * scaleX,(42 + spot * 7) * scaleZ,8 + random() * 18,5 + random() * 8,.3,0,Math.PI * 2); context.fill();
    }
    context.globalCompositeOperation = 'destination-out';
    for (let wear = 0; wear < 10000; wear++) { context.fillStyle = `rgba(0,0,0,${random() * .65})`; context.fillRect(random() * 768,random() * 2048,.5 + random() * 3,1 + random() * 5); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

export function createRealismWorld(): WorldData {
  const group = new THREE.Group(); group.name = '佐敦街口 · 原創品質樣板';
  const obstacles: Obstacle[] = [];
  const distantGround = new THREE.Mesh(new THREE.PlaneGeometry(1800,1800),new THREE.MeshLambertMaterial({ color: 0x424542 }));
  distantGround.name = 'peripheral-ground'; distantGround.rotation.x = -Math.PI / 2; distantGround.position.set(0,-.04,45); group.add(distantGround);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(300,340),streetAsphalt()); road.rotation.x = -Math.PI / 2; road.position.z = 45; road.receiveShadow = true; group.add(road);
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(30,170),new THREE.MeshStandardMaterial({ map: roadSurface(), transparent: true, depthWrite: false, roughness: .97, polygonOffset: true, polygonOffsetFactor: -1 }));
  overlay.rotation.x = -Math.PI / 2; overlay.position.set(0,.018,50); overlay.receiveShadow = true; group.add(overlay);
  group.add(building(-24.5,69,23,20,17.7,Math.PI,0,obstacles));
  group.add(building(24,68.4,22,19,28,Math.PI,1,obstacles));
  const rows = [{ z: 36,width: 22,height: 30.5 },{ z: 13,width: 23,height: 19 },{ z: -10,width: 21,height: 32.5 },{ z: 117,width: 28,height: 18 }];
  for (const [index,row] of rows.entries()) for (const side of [-1,1]) group.add(building(side * (13 + (index % 2) * .6),row.z,row.width,16 + index % 2 * 3,row.height + (side > 0 ? 3 : 0),side * Math.PI / 2,2 + index * 2 + (side > 0 ? 1 : 0),obstacles));
  group.add(building(-44,98,20,22,34,0,10,obstacles),building(47,97,24,22,23,0,11,obstacles));
  group.add(building(1,-39,29,18,21,Math.PI,12,obstacles));
  const pavement = new GeometryBatch(concrete), metal = new GeometryBatch(oxidizedMetal), rubber = new GeometryBatch(blackRubber);
  for (const side of [-1,1]) for (const span of [[-30,69],[100,138]]) {
    const start = span[0]!, end = span[1]!;
    pavement.box({ position: [side * 12,.13,(start + end) / 2], scale: [2.6,.26,end - start] }, 0x93988f);
    for (let segment = start; segment < end; segment += 1.25) pavement.box({ position: [side * 10.74,.16,segment + .6], scale: [.18,.32,1.18] }, segment % 7 < 1 ? 0x676e63 : segment % 4 < 2 ? 0xb2b4a8 : 0x969f91);
    for (let seam = start; seam < end; seam += 1.5) rubber.box({ position: [side * 12,.266,seam], scale: [2.5,.006,.012] }, 0xb3b6aa);
    for (let drain = start + 4; drain < end; drain += 14) {
      metal.box({ position: [side * 10.43,.03,drain], scale: [.42,.035,.85] }, 0x343d38);
      for (let slot = 0; slot < 7; slot++) rubber.box({ position: [side * 10.43,.052,drain - .3 + slot * .1], scale: [.3,.01,.04] }, 0x333a35);
    }
  }
  for (const side of [-1,1]) {
    for (const along of [67,102]) {
      pavement.box({ position: [side * 11.5,.275,along], scale: [1.45,.025,1.1] }, 0xb5a46c);
      for (let ridge = 0; ridge < 6; ridge++) pavement.box({ position: [side * 11.5,.297,along - .43 + ridge * .17], scale: [1.25,.025,.035] }, 0x91865d);
      for (const offset of [-1.8,1.8]) {
        metal.cylinder({ position: [side * 11.3,.7,along + offset], scale: [.07,.92,.07] }, 0x657060);
        metal.cylinder({ position: [side * 11.3,.99,along + offset], scale: [.075,.12,.075] }, 0xd7d0af);
      }
    }
    for (const along of [20,44,112]) metal.box({ position: [side * 12,.274,along], scale: [.62,.024,.85] }, 0x56675d);
    for (const along of [57,106]) {
      for (let post = 0; post < 4; post++) metal.cylinder({ position: [side * 11.1,.77,along + post * 1.3], scale: [.035,1,.035] }, 0x85917f);
      for (const height of [.56,1.24]) metal.box({ position: [side * 11.1,height,along + 1.95], scale: [.045,.045,3.9] }, 0x9ca68e);
    }
  }
  for (const [horizontal,along,text] of [[-18,70,'今日常餐'],[19,69.4,'配藥服務']] as const) {
    const board = new THREE.Group(); board.position.set(horizontal,.96,along); board.rotation.y = Math.PI;
    sign(board,text,'街坊小店','#263f38','#d3c5a1',[0,0,0],.8,1.1); group.add(board);
    for (const offset of [-.43,.43]) metal.box({ position: [horizontal + offset,.86,along], scale: [.04,1.3,.05] }, 0x8e8165);
  }
  for (const position of [[-10.3,77],[14.4,94],[-11,46],[11,17]]) {
    const horizontal = position[0]!, along = position[1]!;
    metal.cylinder({ position: [horizontal,3.7,along], scale: [.055,7.4,.055] }, 0x788577);
    metal.box({ position: [horizontal - Math.sign(horizontal) * .58,7.38,along], scale: [1.2,.07,.08] }, 0x819080);
    metal.box({ position: [horizontal - Math.sign(horizontal) * 1.16,7.33,along], scale: [.47,.13,.28] }, 0x6d766a);
  }
  for (const location of [[-11,71],[14.5,98]]) {
    const horizontal = location[0]!, along = location[1]!;
    metal.cylinder({ position: [horizontal,1.55,along], scale: [.045,3.1,.045] }, 0x737d70);
    const street = new THREE.Group(); street.position.set(horizontal,2.9,along); street.rotation.y = Math.PI;
    sign(street,'佐敦演習街','JORDAN TRAINING ST','#c3c6b4','#344944',[0,0,0],2.1,.47); group.add(street);
  }
  const debris = new GeometryBatch(concrete), rubbleSites = [[-9.7,24],[-10,64],[9.8,14],[10,100]];
  for (let piece = 0; piece < 84; piece++) {
    const site = rubbleSites[piece % rubbleSites.length]!, spread = Math.sin(piece * 17.7) * .5 + .5;
    const horizontal = site[0]! + Math.cos(piece * 2.4) * spread * .7, along = site[1]! + Math.sin(piece * 2.4) * spread * 2.2;
    const thickness = piece % 5 ? .07 + spread * .1 : .15;
    debris.box({ position: [horizontal,thickness * .5 + .035,along], scale: [.13 + spread * .48,thickness,.16 + spread * .36], rotation: [.1,piece * .73,.08] }, piece % 4 ? 0x9d978b : 0x8a7564);
  }
  const scars = new GeometryBatch(new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: .38, depthWrite: false }));
  for (let index = 0; index < 12; index++) scars.box({ position: [-12.91,1.1 + index % 4 * .43,23 + index * .7], scale: [.015,.27 + index % 2 * .29,.25 + index % 3 * .23], rotation: [index * .31,0,0] }, 0x464b42);
  for (const position of [[-8.5,60],[8.8,14]]) {
    const horizontal = position[0]!, along = position[1]!;
    pavement.box({ position: [horizontal,.47,along], scale: [2.8,.94,.62], rotation: [0,.12,0] }, 0x8c9487);
    metal.box({ position: [horizontal,.55,along + .32], scale: [2.5,.24,.015], rotation: [0,.12,0] }, 0xc1ad76);
    obstacles.push({ x: horizontal,z: along,halfX: 1.45,halfZ: .5,surface: 'building',height: .94 });
  }
  pavement.finish(group,true,40); metal.finish(group,false,40); rubber.finish(group,false,40); debris.finish(group,false,40); scars.finish(group,false);
  const cables = new THREE.BufferGeometry(), points: number[] = [];
  for (const along of [65,40,-4]) for (let segment = 0; segment < 18; segment++) {
    const begin = -14 + segment * 28 / 18, end = begin + 28 / 18;
    points.push(begin,9 + (begin / 14) ** 2 * 1.2,along,end,9 + (end / 14) ** 2 * 1.2,along);
  }
  cables.setAttribute('position',new THREE.Float32BufferAttribute(points,3)); group.add(new THREE.LineSegments(cables,new THREE.LineBasicMaterial({ color: 0x515b50 })));
  const backdrop = new GeometryBatch(distantFacade);
  for (let tower = 0; tower < 17; tower++) {
    const height = 26 + (tower * 17) % 39, horizontal = -108 + tower * 13;
    backdrop.box({ position: [horizontal,height / 2,-92 - tower % 3 * 15], scale: [11,height,16] }, 0x6b8581);
    backdrop.box({ position: [horizontal + 2,height + 1.8,-92 - tower % 3 * 15], scale: [.07,3.6,.07] }, 0x5c746e);
    backdrop.box({ position: [horizontal + 2,height + 2.7,-92 - tower % 3 * 15], scale: [1.5,.06,.07] }, 0x5c746e);
    for (let floor = 5; floor < height - 2; floor += 3.3) backdrop.box({ position: [horizontal,floor,-83.8 - tower % 3 * 15], scale: [10,.22,.03] }, 0x566c69);
  }
  for (const side of [-1,1]) for (let tower = 0; tower < 10; tower++) {
    const height = 23 + (tower * 19 + (side + 1) * 7) % 38, along = -112 + tower * 27;
    backdrop.box({ position: [side * (235 + tower % 3 * 12),height / 2,along], scale: [18,height,19 + tower % 3 * 3] }, tower % 3 ? 0x8b9896 : 0xa0a7a0);
    backdrop.box({ position: [side * (235 + tower % 3 * 12),height + 1.6,along + 2], scale: [11,3.2,12] }, 0x8a9691);
  }
  for (let tower = 0; tower < 21; tower++) {
    const horizontal = -240 + tower * 24, height = 20 + tower * 17 % 15;
    backdrop.box({ position: [horizontal,height / 2,235], scale: [22,height,18] }, tower % 3 ? 0x8b9896 : 0xa0a7a0);
    backdrop.box({ position: [horizontal + 3,height + 1.8,237], scale: [12,3.6,11] }, 0x8a9691);
    for (let floor = 5; floor < height - 2; floor += 3.4) backdrop.box({ position: [horizontal,floor,225.97], scale: [20,.18,.04] }, 0x788b8b);
  }
  backdrop.finish(group,false);
  group.updateMatrixWorld(true);
  group.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
  return { group,obstacles,size: 280 };
}
