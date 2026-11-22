// 3D interpretation of design/character-brief.md: cream fur, long peach-lined ears,
// large brown eyes, rounded proportions, and a small peach scarf.
// Offline asset authoring. The website loads this GLB; it never generates a model.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, writeFile } from 'node:fs/promises';
class NodeFileReader {
  async readAsArrayBuffer(blob) { this.result = await blob.arrayBuffer(); this.onloadend?.(); }
  async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`; this.onloadend?.(); }
}
globalThis.FileReader = NodeFileReader;
const root = new T.Group(); root.name = 'Alice';
const cream = new T.MeshStandardMaterial({color:'#ffefcf',roughness:0.85});
const pink = new T.MeshStandardMaterial({color:'#efa6a1',roughness:0.8});
const dark = new T.MeshStandardMaterial({color:'#4b3028'});
const peach = new T.MeshStandardMaterial({color:'#f2b49b',roughness:0.9});
const highlight = new T.MeshStandardMaterial({color:'#fffaf0',roughness:0.7});
function ball(parent,name,x,y,z,sx,sy,sz,mat) {
 const mesh=new T.Mesh(new T.SphereGeometry(1,20,14),mat);mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);return mesh;
}
ball(root,'Body',0,0.8,0,.36,.46,.28,cream);
ball(root,'Head',0,1.44,0,.43,.4,.36,cream);
for(const sign of [-1,1]){
 ball(root,`Ear${sign}`,sign*.23,1.98,-.04,.12,.42,.10,cream);
 ball(root,`EarInner${sign}`,sign*.23,1.99,.05,.065,.29,.025,pink);
 ball(root,`Eye${sign}`,sign*.14,1.48,.33,.065,.085,.035,dark);
 ball(root,`EyeSparkle${sign}`,sign*.14-.018,1.51,.362,.018,.023,.012,highlight);
 ball(root,`Cheek${sign}`,sign*.25,1.34,.29,.065,.038,.02,pink);
 const leg=new T.Group();leg.name=sign<0?'LeftLeg':'RightLeg';leg.position.set(sign*.19,.49,0);root.add(leg);
 ball(leg,`Foot${sign}`,0,-.27,.06,.14,.28,.18,cream);
 const arm=new T.Group();arm.name=sign<0?'LeftArm':'RightArm';arm.position.set(sign*.35,1.05,0);root.add(arm);
 ball(arm,`Hand${sign}`,0,-.2,0,.10,.26,.10,cream);
}
// A rounded collar and two soft scarf ends keep the silhouette readable in 3D.
const scarf = new T.Mesh(new T.TorusGeometry(.245,.075,12,32),peach);
scarf.name='PeachScarf';scarf.rotation.x=Math.PI/2;scarf.position.set(0,1.13,0);root.add(scarf);
ball(root,'ScarfKnot',.16,1.10,.25,.10,.09,.08,peach);
const scarfEnd=ball(root,'ScarfEnd',.18,.93,.29,.09,.20,.045,peach);
scarfEnd.rotation.z=.18;
const scarfTip=ball(root,'ScarfTip',.29,1.00,.23,.075,.15,.04,peach);
scarfTip.rotation.z=.55;
ball(root,'Nose',0,1.35,.37,.04,.03,.024,pink);
ball(root,'Mouth',0,1.27,.35,.035,.012,.018,dark);
ball(root,'Tail',0,.67,-.31,.16,.16,.16,cream);
function clip(name,duration,positions,swings,tilt=0) {
 const times=[0,duration/4,duration/2,duration*3/4,duration];
 const tracks=[new T.VectorKeyframeTrack('Alice.position',times,positions.flat())];
 for(const [joint,phase] of [['LeftLeg',1],['RightLeg',-1],['LeftArm',-1],['RightArm',1]]){
  const values=swings.flatMap(v=>new T.Quaternion().setFromEuler(new T.Euler(v*phase,0,joint.includes('Arm')?tilt*phase:0)).toArray());
  tracks.push(new T.QuaternionKeyframeTrack(`${joint}.quaternion`,times,values));
 }
 return new T.AnimationClip(name,duration,tracks);
}
const clips=[
 clip('idle',3,[[0,0,0],[0,.025,0],[0,0,0],[0,.025,0],[0,0,0]],[0,.03,0,-.03,0]),
 clip('walk',2.4,[[-.65,0,0],[0,.06,0],[.65,0,0],[0,.06,0],[-.65,0,0]],[0,.6,0,-.6,0]),
 clip('run',1.2,[[-1.1,.02,0],[0,.22,0],[1.1,.02,0],[0,.22,0],[-1.1,.02,0]],[0,1.1,0,-1.1,0],.15),
 clip('hide',3,[[0,0,0],[-1.45,-.22,-.6],[-1.45,-.33,-.6],[-1.45,-.22,-.6],[0,0,0]],[0,.5,0,-.5,0]),
 clip('celebrate',1.5,[[0,0,0],[0,.38,0],[0,0,0],[0,.38,0],[0,0,0]],[0,.1,0,-.1,0],1.9),
];
const scene=new T.Scene();scene.add(root);
const result=await new GLTFExporter().parseAsync(scene,{binary:true,animations:clips});
await mkdir('public/demo',{recursive:true});await writeFile('public/demo/alice.glb',Buffer.from(result));
console.log(`Authored alice.glb (${result.byteLength} bytes): ${clips.map(c=>c.name).join(', ')}`);
