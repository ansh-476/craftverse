const API='http://localhost:3000';

async function checkPending(tab){
  if(!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) return;
  try{
    const r=await fetch(`${API}/api/autofill/pending?url=${encodeURIComponent(tab.url)}`);
    if(!r.ok) return;
    const session=await r.json();
    if(!session) return;
    chrome.tabs.sendMessage(tab.id,{type:'FILL'},async response=>{
      if(chrome.runtime.lastError) return;
      if(response?.success){
        await fetch(`${API}/api/autofill/consume`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:session.id})}).catch(()=>{});
        await fetch(`${API}/api/history`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:tab.url,fields:response.count,confidence:99})}).catch(()=>{});
      }
    });
  }catch(e){console.debug('CraftVerse session check failed',e);}
}
chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab)=>{if(changeInfo.status==='complete') setTimeout(()=>checkPending(tab),700);});
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{if(msg.type==='FILL_ACTIVE'){chrome.tabs.query({active:true,currentWindow:true},tabs=>{if(tabs[0])chrome.tabs.sendMessage(tabs[0].id,{type:'FILL'},sendResponse)});return true;}});
