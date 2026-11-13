import {useEffect,useRef,useState} from 'react';
export default function AudioRecorder({onFile,onError,disabled=false}:{onFile:(file:File)=>void;onError:(message:string)=>void;disabled?:boolean}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[opening,setOpening]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),alive=useRef(true),discard=useRef(false),started=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;discard.current=true;if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop())}},[]);
 useEffect(()=>{if(!recording)return;const timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-started.current)/1000);setSeconds(elapsed);if(elapsed>=180)recorder.current?.stop()},250);return()=>clearInterval(timer)},[recording]);
 const start=async()=>{if(opening||recording)return;setOpening(true);try{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Seu navegador não permite gravar áudio. Você pode anexar um arquivo de áudio.');
  const media=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){media.getTracks().forEach(track=>track.stop());return}stream.current=media;
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));const rec=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=rec;const chunks:Blob[]=[];discard.current=false;
  rec.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
  rec.onstop=()=>{media.getTracks().forEach(track=>track.stop());if(!alive.current)return;setRecording(false);if(discard.current)return;const type=rec.mimeType||chunks[0]?.type||'audio/webm';const blob=new Blob(chunks,{type});if(!blob.size){onError('A gravação ficou vazia. Tente novamente.');return}if(blob.size>16*1024*1024){onError('O áudio excedeu 16 MB. Grave um áudio menor.');return}const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';onFile(new File([blob],`audio-${Date.now()}.${ext}`,{type}))};
  rec.onerror=()=>{discard.current=true;media.getTracks().forEach(track=>track.stop());if(alive.current){setRecording(false);onError('Não foi possível gravar o áudio. Tente novamente.')}};
  started.current=Date.now();setSeconds(0);rec.start(1000);setRecording(true);
 }catch(caught){const error=caught as Error;if(alive.current)onError(error.name==='NotAllowedError'?'Permita o microfone no navegador para gravar áudio.':error.message)}finally{if(alive.current)setOpening(false)}};
 if(recording)return <div className="audio-recording" role="status"><span>● {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><button type="button" onClick={()=>recorder.current?.stop()}>Parar</button><button type="button" onClick={()=>{discard.current=true;recorder.current?.stop()}}>Descartar</button></div>;
 return <button type="button" className="record-audio" title="Gravar áudio" aria-label="Gravar áudio" disabled={disabled||opening} onClick={()=>void start()}>{opening?'…':'🎙'}</button>;
}
