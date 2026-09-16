require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'juancho_token_123';
const MODEL = 'gemini-1.5-flash';
const BASE = fs.readFileSync('./META_BOT_INSTRUCTIONS.md','utf8');

const SYSTEM = BASE + ` Vendes en Marketplace Colombia. Proveedora Karo Tenis. Si necesitas validar stock di "Estoy verificando con mi proveedora Karo Tenis" y marca [VALIDAR: modelo color talla]. Precios: 180k normal, 210k exclusivo y guayos (guayos sin descuento), botas min 190k. Tallas dama 36-39, caballero 40-44. Corto, 1 pregunta por mensaje, colombiano.`;

const hist = new Map();
async function sendFB(id, text){
  const axios = require('axios');
  try{ await axios.post(`https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_TOKEN}`, { recipient:{id}, message:{text} }); }catch(e){ console.log(e.response?.data); }
}
async function genResp(senderId, msgCliente){
  const h = hist.get(senderId) || [];
  const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: SYSTEM });
  const chat = model.startChat({ history: h.slice(-10,-1).map(m=>({role: m.role==='assistant'?'model':'user', parts:[{text:m.content}]})), generationConfig:{temperature:0.6} });
  const result = await chat.sendMessage(msgCliente);
  let resp = result.response.text();
  let validar=null; const m=resp.match(/\[VALIDAR:(.*?)\]/i); if(m){validar=m[1].trim(); resp=resp.replace(/\[VALIDAR:.*?\]/gi,'').trim();}
  h.push({role:'user', content:msgCliente}); h.push({role:'assistant', content:resp}); hist.set(senderId,h);
  return {resp, validar};
}
app.get('/webhook', (req,res)=>{ if(req.query['hub.mode']==='subscribe' && req.query['hub.verify_token']===VERIFY_TOKEN){ res.send(req.query['hub.challenge']); } else res.sendStatus(403); });
app.post('/webhook', async (req,res)=>{
  if(req.body.object==='page'){
    for(const entry of req.body.entry){
      for(const ev of (entry.messaging||[])){
        if(ev.message?.text){
          const sender=ev.sender.id; const txt=ev.message.text;
          try{ const {resp}=await genResp(sender,txt); await sendFB(sender,resp); }catch(e){ await sendFB(sender,'Dame un segundito que verifico el dato exacto contigo 🙏'); }
        }
      }
    }
    res.send('EVENT_RECEIVED');
  } else res.sendStatus(404);
});
app.get('/', (req,res)=>res.send('Bot Juancho Marketplace Activo - Gemini'));
app.listen(process.env.PORT||3000, ()=>console.log('Bot corriendo'));
