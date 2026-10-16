import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

export function createRealismSky(): Mesh<SphereGeometry,ShaderMaterial> {
  const material = new ShaderMaterial({ side: BackSide,depthWrite: false,depthTest: false,
    uniforms: { zenith: { value: new Color(0x6e8fa8) },horizon: { value: new Color(0xb7beb9) },cloud: { value: new Color(0xc9ccc5) } },
    vertexShader: 'varying vec3 skyDirection;void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 skyDirection;uniform vec3 zenith;uniform vec3 horizon;uniform vec3 cloud;
      float skyHash(vec2 point){vec3 seed=fract(vec3(point.xyx)*.1031);seed+=dot(seed,seed.yzx+33.33);return fract((seed.x+seed.y)*seed.z);}
      float skyNoise(vec2 point){vec2 cell=floor(point),blend=fract(point);blend=blend*blend*(3.-2.*blend);
        return mix(mix(skyHash(cell),skyHash(cell+vec2(1.,0.)),blend.x),mix(skyHash(cell+vec2(0.,1.)),skyHash(cell+vec2(1.,1.)),blend.x),blend.y);}
      void main(){vec3 direction=normalize(skyDirection);float elevation=max(0.,direction.y);
        vec3 color=mix(horizon,zenith,smoothstep(0.,.75,elevation));
        vec2 projected=direction.xz/(elevation+.24);
        float coverage=skyNoise(projected*2.1+vec2(17.,4.))*.72+skyNoise(projected*5.4+vec2(3.,11.))*.28;
        float veil=smoothstep(.43,.73,coverage)*smoothstep(.03,.19,elevation)*(1.-smoothstep(.8,1.,elevation))*.48;
        color=mix(color,cloud,veil);
        float forwardHaze=pow(max(0.,dot(direction,normalize(vec3(-45.,58.,65.)))),12.)*.065;
        gl_FragColor=vec4(mix(color,cloud,forwardHaze),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const sky = new Mesh(new SphereGeometry(450,24,12),material);
  sky.name = 'street-atmosphere'; sky.renderOrder = -1000; sky.frustumCulled = false;
  return sky;
}
