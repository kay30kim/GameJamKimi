"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ACTIONS, LESSONS, VOCABULARY, actionFromSpeech, audioId, getNarration, narrationLanguage } from "@/lib/demo/story";
import type { Action, LearningLanguage, Lesson, Motion, StoryNode } from "@/lib/demo/story";
import { listenOnce, isListeningSupported, speak, stopSpeaking, stopListening } from "@/lib/speech";
import styles from "./demo.module.css";
const ForestStage=dynamic(()=>import("./forest-stage"),{ssr:false,loading:()=> <div className={styles.stageLoading}>Opening the woodland…</div>});
const subscribe=()=>()=>{};
const subscribeMotion=(notify:()=>void)=>{const m=matchMedia('(prefers-reduced-motion: reduce)');m.addEventListener('change',notify);return()=>m.removeEventListener('change',notify);};
const reducedSnapshot=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const no=()=>false;
type Settings={age:number;language:LearningLanguage;lesson:Lesson};
const lessonNotes={empathy:"Notice how a friend feels",sharing:"Make room for everyone",sacrifice:"Choose kindness, care for yourself"};
const choiceLabels={en:{walk:"Walk gently",run:"Run to help",hide:"Find a quiet nook"},ko:{walk:"천천히 걸어요",run:"도우러 달려요",hide:"조용한 곳에 숨어요"}};
export default function DemoExperience({audioManifest}:{audioManifest:Record<string,string>}){
 const [settings,setSettings]=useState<Settings>({age:5,language:'ko',lesson:'empathy'});
 const [started,setStarted]=useState(false);
 const [node,setNode]=useState<StoryNode>('intro');
 const [choices,setChoices]=useState<Action[]>([]);
 const [paused,setPaused]=useState(false);
 const [muted,setMuted]=useState(false);
 const [listening,setListening]=useState(false);
 const [feedback,setFeedback]=useState('');
 const [voiceStatus,setVoiceStatus]=useState('');
 const [replay,setReplay]=useState(0);
 const audio=useRef<HTMLAudioElement|null>(null);
 const generation=useRef(0);
 const canListen=useSyncExternalStore(subscribe,isListeningSupported,no);
 const reducedMotion=useSyncExternalStore(subscribeMotion,reducedSnapshot,no);
 const narration=getNarration(settings.lesson,node,settings.language);
 const other=narrationLanguage(settings.language);
 const ended=node==='ending';
 const motion:Motion=!started||node==='intro'?'idle':ended?'celebrate':node;
 const stopAudio=useCallback(()=>{audio.current?.pause();audio.current=null;stopSpeaking();},[]);
 useEffect(()=>{
  if(!started||muted||listening)return;
  let canceled=false;
  const fallback=()=>{if(canceled)return;setVoiceStatus('Voice narration');speak(narration,other==='en'?'en-US':'ko-KR');};
  const file=audioManifest[audioId(settings.lesson,node,settings.language)];
  if(file){
   const player=new Audio(file);audio.current=player;player.playbackRate=settings.age<=4?.88:1;
   player.onerror=fallback;
   void player.play().then(()=>{if(!canceled)setVoiceStatus('ElevenLabs · prerecorded');}).catch(fallback);
  }else fallback();
  return()=>{canceled=true;stopAudio();};
 },[audioManifest,started,muted,listening,node,narration,other,settings,replay,stopAudio]);
 useEffect(()=>()=>{generation.current++;stopAudio();stopListening();},[stopAudio]);
 function choose(action:Action){if(ended||choices.length>=3)return;stopAudio();setNode(action);setChoices(prev=>[...prev,action]);setReplay(v=>v+1);setFeedback('');}
 async function voiceCommand(){
  if(listening||ended||choices.length>=3)return;
  stopAudio();setListening(true);setFeedback('Listening… say one action.');
  const current=++generation.current;
  try{
   const transcript=await listenOnce(settings.language==='en'?'en-US':'ko-KR');
   if(current!==generation.current)return;
   const action=actionFromSpeech(transcript);
   if(action){choose(action);setFeedback(`Heard: “${transcript}”`);}else setFeedback(`Heard: “${transcript}”. Try ${ACTIONS.map(a=>VOCABULARY[a][settings.language]).join(', ')}.`);
  }catch(e){if(current===generation.current)setFeedback(e instanceof Error?e.message:'Please try again.');}
  finally{if(current===generation.current)setListening(false);}
 }
 function reset(){generation.current++;stopListening();stopAudio();setStarted(false);setNode('intro');setChoices([]);setFeedback('');setListening(false);}
 return <main className={styles.page}>
  <header className={styles.header}><Link href="/" className={styles.brand}><span>k.</span>Kimi’s little woodland</Link><span className={styles.demoBadge}>AN INTERACTIVE 3D STORY</span></header>
  <div className={styles.heading}><div><p className={styles.eyebrow}>LITTLE CHOICES. A KINDER WORLD.</p><h1>A little adventure,<br/><em>made together.</em></h1></div><p>Meet Kimi. Explore a story.<br/>See your words come to life.</p></div>
  <div className={styles.layout}>
   <aside className={styles.sidebar}>
    <p className={styles.eyebrow}>{started?'YOUR ADVENTURE':'FOR THE GROWN-UPS'}</p>
    <h2>{started?'A story about '+settings.lesson:'Make it their story'}</h2>
    <fieldset disabled={started} className={styles.settings}>
     <label htmlFor="demo-age">Age <strong>{settings.age} years</strong></label>
     <input id="demo-age" type="range" min="3" max="6" value={settings.age} onChange={e=>setSettings({...settings,age:Number(e.target.value)})}/>
     <div className={styles.marks}><span>3</span><span>4</span><span>5</span><span>6</span></div>
     <p className={styles.hint}>A gentler animation and audio pace for ages 3–4.</p>
     <label htmlFor="demo-language">Language to learn</label>
     <select id="demo-language" value={settings.language} onChange={e=>setSettings({...settings,language:e.target.value as LearningLanguage})}><option value="ko">Korean · 한국어</option><option value="en">English</option></select>
     <p className={styles.hint}>Story guidance in {other==='en'?'English':'Korean'}. New words in {settings.language==='en'?'English':'Korean'}.</p>
     <legend className={styles.srOnly}>Story settings</legend>
     <span className={styles.fieldLabel}>A little lesson in…</span>
     <div className={styles.lessons}>{LESSONS.map(lesson=><button type="button" key={lesson} aria-pressed={settings.lesson===lesson} className={settings.lesson===lesson?styles.selected:''} onClick={()=>setSettings({...settings,lesson})}><strong>{lesson==='sacrifice'?'Kind sacrifice':lesson[0].toUpperCase()+lesson.slice(1)}</strong><small>{lessonNotes[lesson]}</small></button>)}</div>
    </fieldset>
    {!started?<button className={styles.primary} onClick={()=>{setStarted(true);setNode('intro');setReplay(v=>v+1);}}>Begin our adventure</button>:<button className={styles.secondary} onClick={reset}>Change story settings</button>}
    <p className={styles.parentNote}>Explore together. Every choice is a chance to talk, not a right-or-wrong test.</p>
   </aside>
   <section className={styles.experience} aria-label="Interactive woodland">
    <div className={styles.stage}>
     <div className={styles.stageTop}><span>THE SUNNY CLEARING</span><span>{!started?'Meet Kimi':ended?'A happy ending':`${choices.length} / 3 little choices`}</span></div>
     <ForestStage motion={motion} paused={paused||reducedMotion} age={settings.age}/>
     <div className={styles.stageBottom}><span className={styles.motionBadge}>{motion==='idle'?'Kimi is ready':motion==='celebrate'?'Well done, little explorer':`Kimi · ${motion}`}</span><button onClick={()=>setPaused(!paused)} disabled={reducedMotion} aria-pressed={paused||reducedMotion}>{reducedMotion?'Reduced motion':paused?'Play animation':'Pause animation'}</button></div>
    </div>
    <div className={styles.story}>
     <div className={styles.storyTop}><p className={styles.eyebrow}>{!started?'YOUR STORY AWAITS':ended?'A LITTLE THOUGHT TO TAKE HOME':'WHAT WILL KIMI DO?'}</p>{started&&<button className={styles.audioButton} onClick={()=>{if(muted)setMuted(false);else{stopAudio();setReplay(v=>v+1);}}}>Hear again</button>}</div>
     <p className={styles.narration} lang={other}>{started?narration:'Choose an age, a learning language, and a little lesson. Then step into Kimi’s woodland.'}</p>
     {started&&!ended&&<>
      <div className={styles.choices}>{ACTIONS.map(action=><button key={action} disabled={choices.length>=3||listening} aria-pressed={node===action} onClick={()=>choose(action)}><span lang={settings.language}>{VOCABULARY[action][settings.language]}</span><small lang={other}>{choiceLabels[other][action]}</small></button>)}</div>
      {choices.length<3?<div className={styles.voiceRow}><button className={styles.secondary} disabled={!canListen||listening} onClick={()=>void voiceCommand()}>{listening?'Listening…':'Say an action'}</button><p>{canListen?`Try “${VOCABULARY.walk[settings.language]}”, “${VOCABULARY.run[settings.language]}”, or “${VOCABULARY.hide[settings.language]}”.`:'Use the buttons here. Voice commands need a supported browser such as Chrome.'}</p></div>:<button className={styles.primary} onClick={()=>{stopAudio();setNode('ending');}}>Finish our story</button>}
     </>}
     {ended&&<div className={styles.ending}><p>Your words: {[...new Set(choices)].map(action=>VOCABULARY[action][settings.language]).join(' · ')}</p><button className={styles.primary} onClick={reset}>Another little adventure</button></div>}
     <p className={styles.feedback} role="status">{feedback}</p>
     {started&&<div className={styles.audioStatus}><span>{muted?'Sound off':voiceStatus}</span><button onClick={()=>{stopAudio();setMuted(!muted);}} aria-pressed={muted}>{muted?'Turn sound on':'Mute'}</button></div>}
    </div>
   </section>
  </div>
  <footer className={styles.footer}><span>One small choice can make a big difference.</span><Link href="/">Back to the main game</Link></footer>
 </main>;
}
