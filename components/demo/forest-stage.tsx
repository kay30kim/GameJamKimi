"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { AnimationMixer, Group, MathUtils } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Motion } from "@/lib/demo/story";

function Alice({ motion, paused, pace, talking = false }: { motion: Motion; paused: boolean; pace: number; talking?: boolean }) {
  const gltf = useLoader(GLTFLoader, "/demo/alice.glb");
  const model = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((object) => { object.castShadow = true; object.receiveShadow = true; });
    return copy;
  }, [gltf]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  useEffect(() => {
    const clip = gltf.animations.find((item) => item.name === motion);
    if (!clip) return;
    const action = mixer.clipAction(clip).reset().setEffectiveWeight(1).fadeIn(.25).play();
    return () => { action.fadeOut(.25); };
  }, [gltf, mixer, motion]);
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model); }, [mixer, model]);
  useFrame(({ clock }, delta) => {
    if (!paused) mixer.update(Math.min(delta, .05) * pace);
    const mouth = model.getObjectByName("Mouth");
    if (mouth) mouth.scale.y = talking && !paused ? .025 + Math.abs(Math.sin(clock.elapsedTime * 14)) * .055 : .012;
    const head = model.getObjectByName("Head");
    if (head) head.rotation.z = talking && !paused ? Math.sin(clock.elapsedTime * 3) * .045 : 0;
  });
  return <primitive object={model} dispose={null} />;
}

function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return <group position={position} scale={scale}>
    <mesh position={[0,.8,0]} castShadow><cylinderGeometry args={[.15,.24,1.6,8]} /><meshStandardMaterial color="#956c51" /></mesh>
    <mesh position={[0,2,0]} castShadow><sphereGeometry args={[.85,12,10]} /><meshStandardMaterial color="#6c9e76" roughness={1} /></mesh>
    <mesh position={[-.48,1.65,.06]} castShadow><sphereGeometry args={[.65,12,10]} /><meshStandardMaterial color="#83ae7b" roughness={1} /></mesh>
  </group>;
}
function World({ motion, paused, age, talking, word }: StageProps) {
  const world = useRef<Group>(null);
  useFrame(({ pointer }, delta) => {
    if (world.current) world.current.rotation.y = MathUtils.damp(world.current.rotation.y, pointer.x * .07, 3, delta);
  });
  return <>
    <color attach="background" args={["#dcece6"]} />
    <fog attach="fog" args={["#dcece6",12,24]} />
    <ambientLight intensity={1.6} />
    <directionalLight position={[4,7,5]} intensity={2.7} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-normalBias={.04} />
    <group ref={world}>
      <mesh position={[0,-.18,0]} receiveShadow><cylinderGeometry args={[4.3,4, .35,64]} /><meshStandardMaterial color="#96b596" roughness={1} /></mesh>
      <mesh position={[0,.005,.1]} rotation={[-Math.PI/2,0,0]} receiveShadow><circleGeometry args={[2.25,48]} /><meshStandardMaterial color="#decda9" roughness={1} /></mesh>
      <Tree position={[-2.8,0,-1.5]} scale={1.2} /><Tree position={[2.7,0,-1.6]} scale={1.5} /><Tree position={[.8,0,-3]} scale={.9} />
      <group position={[-1.6,.35,.2]}>
        {[-.3,0,.3].map((x,i)=><mesh key={x} position={[x,i===1?.15:0,0]} castShadow><sphereGeometry args={[.52,14,10]} /><meshStandardMaterial color={i===1?"#5a8b68":"#729e71"} /></mesh>)}
      </group>
      <group position={[1.8,.12,.6]} rotation={[0,.2,0]}>
        <mesh receiveShadow><boxGeometry args={[1.1,.04,.85]} /><meshStandardMaterial color="#f2ddae" /></mesh>
        <mesh position={[.1,.2,0]} castShadow><boxGeometry args={[.45,.35,.35]} /><meshStandardMaterial color="#b98251" /></mesh>
        <mesh position={[.1,.4,0]}><torusGeometry args={[.17,.025,8,16,Math.PI]} /><meshStandardMaterial color="#875a38" /></mesh>
      </group>
      {[[2.5,.1,1.3],[-2.7,.1,.9],[.8,.1,1.8]].map((p,i)=><group key={i} position={p as [number,number,number]}><mesh position={[0,.1,0]}><cylinderGeometry args={[.025,.025,.22,6]} /><meshStandardMaterial color="#53815e" /></mesh><mesh position={[0,.24,0]}><sphereGeometry args={[.09,8,6]} /><meshStandardMaterial color={i===1?"#edac9a":"#f4ce67"} /></mesh></group>)}
      {word && /^(apple|사과)$/i.test(word) && <group position={[.75,1.15,.4]}>
        <mesh castShadow><sphereGeometry args={[.22,24,16]}/><meshStandardMaterial color="#df665f" roughness={.7}/></mesh>
        <mesh position={[0,.23,0]} rotation={[0,0,-.2]}><cylinderGeometry args={[.025,.03,.15,8]}/><meshStandardMaterial color="#79553d"/></mesh>
        <mesh position={[.09,.27,0]} rotation={[0,0,-.5]} scale={[1,.45,.3]}><sphereGeometry args={[.12,12,8]}/><meshStandardMaterial color="#70a76b"/></mesh>
      </group>}
      <Suspense fallback={null}><Alice motion={motion} paused={paused} pace={age<=4?.78:1} talking={talking} /></Suspense>
    </group>
  </>;
}
class StageBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p role="alert" style={{padding:32}}>The 3D stage could not load. Enable WebGL or try another browser. You can still read the story below.</p>:this.props.children;}
}
interface StageProps { motion: Motion; paused: boolean; age: number; talking?: boolean; word?: string; immersive?: boolean }
export default function ForestStage(props: StageProps) {
  return <StageBoundary><Canvas shadows dpr={[1,1.5]} camera={{position:props.immersive ? [0,2.6,5.8] : [0,3.5,7.2],fov:40}} onCreated={({camera})=>camera.lookAt(0,.8,0)} fallback={<p>3D needs WebGL. Please try a browser with hardware acceleration enabled.</p>} aria-label={`Alice the bunny is ${props.motion}`}><World {...props}/></Canvas></StageBoundary>;
}
