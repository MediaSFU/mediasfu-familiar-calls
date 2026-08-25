export type SessionStatus = 'ringing' | 'active' | 'ended';
export interface CallSession { id:string;hostUserId:string;targetUserId:string;displayName:string;meetingId:string;status:SessionStatus;eventType:string;createdAt:string;updatedAt:string;endedAt?:string|null;endReason?:string|null }
export interface SessionRoomResponse { success:true;data:Record<string,unknown>;session:CallSession }

async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,headers:{'Content-Type':'application/json',...init?.headers}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.success===false)throw new Error(body.error||`Request failed (${response.status}).`);
  return body as T;
}
export async function listSessions(userId:string):Promise<CallSession[]>{return (await request<{success:true;data:CallSession[]}>(`/users/${encodeURIComponent(userId)}/sessions`)).data}
export function createSession(input:{hostUserId:string;targetUserId:string;displayName:string}):Promise<SessionRoomResponse>{return request('/rooms/create',{method:'POST',body:JSON.stringify({...input,duration:30,capacity:2,eventType:'conference'})})}
export function joinSession(input:{sessionId:string;userId:string;displayName:string}):Promise<SessionRoomResponse>{return request('/rooms/join',{method:'POST',body:JSON.stringify(input)})}
export async function endSession(sessionId:string,userId:string,reason:'user_ended'|'declined'='user_ended'):Promise<CallSession>{return (await request<{success:true;data:CallSession}>(`/sessions/${encodeURIComponent(sessionId)}/end`,{method:'POST',body:JSON.stringify({userId,reason})})).data}
