import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { AudioGrid, MediasfuGeneric, MediasfuHeadlessService, PreJoinPage } from 'mediasfu-angular';
import { createSession, endSession, joinSession, listSessions, type CallSession } from './session-api';

interface Identity { userId:string;displayName:string }
type CallConfig = {mode:'create';targetUserId:string;callType:'audio'|'video'}|{mode:'join';session:CallSession;callType:'audio'|'video'};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, AsyncPipe, FormsModule, MediasfuGeneric, AudioGrid],
  providers: [MediasfuHeadlessService],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css', './call-parity.css'],
})
export class AppComponent implements OnDestroy {
  @ViewChild('testCanvas') private testCanvas?:ElementRef<HTMLCanvasElement>;
  @ViewChild('mediaStage') private mediaStage?:ElementRef<HTMLElement>;
  @ViewChild('previewStrip') private previewStrip?:ElementRef<HTMLElement>;
  readonly preJoinPage = PreJoinPage;
  identity:Identity|null=this.loadIdentity(); userId='';displayName='';targetUserId='';sessions:CallSession[]=[];call:CallConfig|null=null;activeSession:CallSession|null=null;notice='';
  demoActive=false;focusIndex=0;miniOffset={x:0,y:0};screenShare:any={stream:null,isLocal:false};remoteVideos:any[]=[];localVideo:MediaStream|null=null;private pollTimer?:number;private demoTimer?:number;private demoStream?:MediaStream;private mediaStarted=false;private roleApplied=false;private dragState?:{pointerId:number;startX:number;startY:number;originX:number;originY:number};private readonly subscriptions=new Subscription();

  constructor(public readonly room:MediasfuHeadlessService){
    this.subscriptions.add(this.room.ready$.subscribe((ready)=>{if(ready&&!this.mediaStarted&&this.call)void this.startMedia()}));
    this.subscriptions.add(this.room.screenShare$.subscribe((screen)=>{this.screenShare=screen;if(screen.stream)this.focusIndex=0;queueMicrotask(()=>this.measurePreview())}));
    this.subscriptions.add(this.room.remoteVideos$.subscribe((remote)=>{this.remoteVideos=remote;this.normalizeFocus();queueMicrotask(()=>this.measurePreview())}));
    this.subscriptions.add(this.room.localVideo$.subscribe((local)=>{this.localVideo=local;this.normalizeFocus();queueMicrotask(()=>this.measurePreview())}));
    void this.refreshSessions();this.pollTimer=window.setInterval(()=>void this.refreshSessions(),1800);
    window.addEventListener('resize',this.measurePreview);
  }
  get incoming(){return this.sessions.find((item)=>item.status==='ringing'&&item.targetUserId===this.identity?.userId)||null}
  get peerName(){return this.call?.mode==='create'?this.call.targetUserId:this.call?.session.hostUserId||'Contact'}
  get preJoinOptions():any{if(!this.identity||!this.call)return undefined;return this.call.mode==='join'?{action:'join',meetingID:this.call.session.meetingId,userName:this.identity.displayName}:{action:'create',duration:30,capacity:2,eventType:'conference',userName:this.identity.displayName}}
  get surfaces(){const next:any[]=[];if(this.screenShare?.stream)next.push({stream:this.screenShare.stream,local:this.screenShare.isLocal,screen:true,key:`screen-${this.screenShare.stream.id}`,label:this.screenShare.isLocal?'Your screen':`${this.peerName}'s screen`});const remote=this.remoteVideos[0];if(remote?.stream)next.push({stream:remote.stream,local:false,screen:false,key:`remote-${remote.producerId||remote.stream.id}`,label:this.peerName});if(this.localVideo)next.push({stream:this.localVideo,local:true,screen:false,key:`local-${this.localVideo.id}`,label:'You'});return next}
  get screenActive(){return this.surfaces[0]?.screen===true}
  get normalizedFocus(){return this.screenActive?0:Math.min(this.focusIndex,Math.max(this.surfaces.length-1,0))}
  get primary(){return this.surfaces[this.normalizedFocus]||null}
  get previews(){return this.surfaces.filter((_:any,index:number)=>index!==this.normalizedFocus)}
  get canSwapFocus(){return !this.screenActive&&this.surfaces.length>1}
  private loadIdentity():Identity|null{try{const value=JSON.parse(localStorage.getItem('mediasfu-familiar-identity')||'null');return value?.userId&&value?.displayName?value:null}catch{return null}}
  saveIdentity(){const id=this.userId.trim(),name=this.displayName.trim();if(!/^[A-Za-z0-9_-]{2,64}$/.test(id)||!/^[A-Za-z0-9]{2,10}$/.test(name)){this.notice='Use a 2–64 character ID and a 2–10 character alphanumeric display name.';return}this.identity={userId:id,displayName:name};localStorage.setItem('mediasfu-familiar-identity',JSON.stringify(this.identity));void this.refreshSessions()}
  async refreshSessions(){if(!this.identity)return;try{this.sessions=(await listSessions(this.identity.userId)).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))}catch(error){this.notice=error instanceof Error?error.message:'Call service unavailable.'}}
  begin(callType:'audio'|'video'){if(!this.identity||!/^[A-Za-z0-9_-]{2,64}$/.test(this.targetUserId.trim())){this.notice='Choose a valid contact ID.';return}this.resetEngine();this.call={mode:'create',targetUserId:this.targetUserId.trim(),callType}}
  accept(session:CallSession){this.resetEngine();this.activeSession=session;this.call={mode:'join',session,callType:'video'}}
  async decline(session:CallSession){if(!this.identity)return;try{await endSession(session.id,this.identity.userId,'declined')}catch(error){this.notice=error instanceof Error?error.message:'Could not decline call.'}await this.refreshSessions()}
  readonly createMediaSFURoom=async():Promise<any>=>{if(!this.identity||this.call?.mode!=='create')return{success:false,data:{error:'Call setup expired.'}};try{const response=await createSession({hostUserId:this.identity.userId,targetUserId:this.call.targetUserId,displayName:this.identity.displayName});this.activeSession=response.session;void this.refreshSessions();return{success:true,data:response.data}}catch(error){const message=error instanceof Error?error.message:'Could not start call.';this.notice=message;return{success:false,data:{error:message}}}};
  readonly joinMediaSFURoom=async():Promise<any>=>{if(!this.identity||this.call?.mode!=='join')return{success:false,data:{error:'Call invitation expired.'}};try{const response=await joinSession({sessionId:this.call.session.id,userId:this.identity.userId,displayName:this.identity.displayName});this.activeSession=response.session;void this.refreshSessions();return{success:true,data:response.data}}catch(error){const message=error instanceof Error?error.message:'Could not accept call.';this.notice=message;return{success:false,data:{error:message}}}};
  readonly updateSourceParameters=(parameters:any)=>{this.room.updateSourceParameters(parameters||{});if(this.call&&!this.roleApplied&&typeof parameters?.updateIslevel==='function'){parameters.updateIslevel(this.call.mode==='create'?'2':'1');this.roleApplied=true}};
  swapFocus(){if(this.canSwapFocus)this.focusIndex=this.focusIndex===0?1:0}
  selectSurface(surface:any){if(this.screenActive)return;const index=this.surfaces.findIndex((item:any)=>item.key===surface.key);if(index>=0)this.focusIndex=index}
  private normalizeFocus(){if(this.screenActive||this.focusIndex>=this.surfaces.length)this.focusIndex=0}
  readonly measurePreview=()=>{const stage=this.mediaStage?.nativeElement.getBoundingClientRect(),mini=this.previewStrip?.nativeElement.getBoundingClientRect();if(!stage||!mini)return;const gap=14,baseLeft=Math.max(stage.width-mini.width-gap,0),clamp=(value:number,min:number,max:number)=>Math.min(Math.max(value,min),max);this.miniOffset={x:clamp(this.miniOffset.x,-baseLeft,gap),y:clamp(this.miniOffset.y,-gap,Math.max(stage.height-mini.height-gap,-gap))}}
  beginMiniDrag(event:PointerEvent){this.dragState={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:this.miniOffset.x,originY:this.miniOffset.y};(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);event.preventDefault()}
  moveMini(event:PointerEvent){const drag=this.dragState;if(!drag||drag.pointerId!==event.pointerId)return;this.miniOffset={x:drag.originX+event.clientX-drag.startX,y:drag.originY+event.clientY-drag.startY};this.measurePreview()}
  endMiniDrag(event:PointerEvent){if(!this.dragState||this.dragState.pointerId!==event.pointerId)return;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);this.dragState=undefined}
  async startMedia(){if(!this.call)return;this.mediaStarted=true;const actions=[this.room.controls.toggleMic()];if(this.call.callType==='video')actions.push(this.room.controls.toggleCamera());const results=await Promise.all(actions);const failed=results.find((result)=>!result.ok);if(failed)this.notice=failed.error}
  async run(action:()=>Promise<{ok:boolean;error:string}>){const result=await action();if(!result.ok)this.notice=result.error}
  async toggleDemoVideo(){if(this.demoActive){if(this.demoTimer)window.clearInterval(this.demoTimer);this.demoTimer=undefined;this.demoStream?.getTracks().forEach((track)=>track.stop());this.demoStream=undefined;const result=await this.room.produce.stop('video');this.demoActive=false;if(!result.ok)this.notice=result.error;return}const canvas=this.testCanvas?.nativeElement,context=canvas?.getContext('2d');if(!canvas||!context){this.notice='The media test canvas is unavailable.';return}let frame=0;const draw=()=>{frame+=1;const hue=(frame*2)%360,gradient=context.createLinearGradient(0,0,canvas.width,canvas.height);gradient.addColorStop(0,`hsl(${hue} 50% 13%)`);gradient.addColorStop(1,`hsl(${(hue+70)%360} 74% 38%)`);context.fillStyle=gradient;context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle='#effff7';context.font='800 72px Inter, sans-serif';context.fillText('MediaSFU live media',76,250);context.font='500 34px Inter, sans-serif';context.fillText(`${this.identity?.displayName||'Caller'} · Angular WebRTC producer`,80,320);context.beginPath();context.arc(130+((frame*9)%980),520,54,0,Math.PI*2);context.fillStyle='#5bf0a4';context.fill()};draw();this.demoTimer=window.setInterval(draw,100);const result=await this.room.produce.canvas(canvas,15);if(!result.ok){if(this.demoTimer)window.clearInterval(this.demoTimer);this.demoTimer=undefined;this.notice=result.error;return}this.demoStream=result.stream||undefined;this.demoActive=true;this.notice=''}
  async finish(){try{if(this.demoActive)await this.toggleDemoVideo();if(await firstValueFrom(this.room.ready$))await this.room.controls.leave();if(this.activeSession&&this.identity)await endSession(this.activeSession.id,this.identity.userId)}catch(error){this.notice=error instanceof Error?error.message:'Call cleanup failed.'}this.call=null;this.activeSession=null;this.room.updateSourceParameters({});await this.refreshSessions()}
  private resetEngine(){this.notice='';this.activeSession=null;this.mediaStarted=false;this.roleApplied=false;this.room.updateSourceParameters({})}
  ngOnDestroy(){if(this.pollTimer)window.clearInterval(this.pollTimer);if(this.demoTimer)window.clearInterval(this.demoTimer);this.demoStream?.getTracks().forEach((track)=>track.stop());window.removeEventListener('resize',this.measurePreview);this.subscriptions.unsubscribe();void this.room.controls.leave()}
}
