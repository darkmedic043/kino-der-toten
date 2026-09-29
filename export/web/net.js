// Co-op connection (not part of upstream): talks to the room relay in
// .tools/kino-server.mjs. One room per game page; the host runs the game.
export class Net {
  constructor(){this.handlers=new Map();this.players=new Map();this.id=null;this.hostId=null;this.code=null;this.ws=null;}
  on(type,fn){if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push(fn);}
  emit(type,...a){for(const fn of this.handlers.get(type)??[])try{fn(...a);}catch(e){console.error('[net]',type,e);}}
  get isHost(){return !!this.id&&this.id===this.hostId;}
  // Resolves on 'welcome' (joined or created); rejects on an error message.
  open(first){
    return new Promise((ok,fail)=>{
      const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/ws`);this.ws=ws;
      ws.onopen=()=>ws.send(JSON.stringify(first));
      ws.onerror=()=>fail(new Error('Could not reach the game server'));
      ws.onclose=()=>{if(this.id)this.emit('closed',this.closedReason??'Disconnected from the game server');this.id=null;};
      ws.onmessage=e=>{
        let m;try{m=JSON.parse(e.data);}catch{return;}
        if(m.t==='welcome'){this.id=m.id;this.hostId=m.host;this.code=m.code;this.page=m.page;for(const p of m.players)this.players.set(p.id,p);ok(m);}
        else if(m.t==='error'){fail(new Error(m.error));}
        else if(m.t==='joined'){this.players.set(m.player.id,m.player);this.emit('joined',m.player);}
        else if(m.t==='left'){const p=this.players.get(m.id);this.players.delete(m.id);const moved=m.host&&m.host!==this.hostId;if(m.host)this.hostId=m.host;this.emit('left',m.id,p);if(moved)this.emit('host',m.host);}
        else if(m.t==='closed'){this.closedReason=m.reason;this.emit('closed',m.reason);}
        else if(m.t==='msg'){this.emit('msg',m.data,m.from);if(m.data?.t)this.emit(m.data.t,m.data,m.from);}
      };
    });
  }
  create(info){return this.open({t:'create',...info});}
  join(code,info){return this.open({t:'join',code,...info});}
  send(target,data){if(this.ws?.readyState===1)this.ws.send(JSON.stringify({t:'to',target,data}));}
  close(){this.ws?.close();}
}
