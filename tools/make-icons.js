// Zeichnet das App-Symbol als PNG (192 und 512 px). Aufruf: node tools/make-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
const BG = [0x2f, 0x6f, 0x6a], FG = [0xf4, 0xf1, 0xea];
const segs = [[150,380,150,250],[150,250,260,250],[260,250,260,150],[260,150,220,190],[260,150,300,190],
              [340,380,360,380],[360,380,360,270],[360,270,330,300],[360,270,390,300]];
const dseg = (px,py,[x1,y1,x2,y2]) => { const dx=x2-x1, dy=y2-y1; const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy))); return Math.hypot(px-x1-t*dx, py-y1-t*dy); };
function inRound(x,y){ const r=112; const cx=Math.min(Math.max(x,r),512-r), cy=Math.min(Math.max(y,r),512-r); return Math.hypot(x-cx,y-cy)<=r; }
const crcT = Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc = (b) => { let c=~0; for (const x of b) c=crcT[(c^x)&255]^(c>>>8); return (~c)>>>0; };
const chunk = (type, data) => { const len=Buffer.alloc(4); len.writeUInt32BE(data.length); const td=Buffer.concat([Buffer.from(type),data]); const c=Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len,td,c]); };
for (const S of [192, 512]) {
  const raw = Buffer.alloc(S * (S * 4 + 1)); const ss = 3;
  for (let y = 0; y < S; y++) { raw[y*(S*4+1)] = 0;
    for (let x = 0; x < S; x++) { let cov=0, fg=0;
      for (let sy=0; sy<ss; sy++) for (let sx=0; sx<ss; sx++) {
        const X=(x+(sx+.5)/ss)*512/S, Y=(y+(sy+.5)/ss)*512/S;
        if (!inRound(X,Y)) continue; cov++;
        if (segs.some(s=>dseg(X,Y,s)<=17)) fg++; }
      const n=ss*ss, o=y*(S*4+1)+1+x*4, f=cov?fg/cov:0;
      for (let i=0;i<3;i++) raw[o+i]=Math.round(BG[i]*(1-f)+FG[i]*f);
      raw[o+3]=Math.round(255*cov/n); } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S,0); ihdr.writeUInt32BE(S,4); ihdr[8]=8; ihdr[9]=6;
  writeFileSync(`icons/icon-${S}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR',ihdr), chunk('IDAT',deflateSync(raw)), chunk('IEND',Buffer.alloc(0))]));
}
console.log('Icons geschrieben');
