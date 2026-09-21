const status=document.getElementById('status');
document.getElementById('fill').onclick=()=>{
 status.innerHTML='<p>⏳ Reading your local vault…</p>';
 chrome.tabs.query({active:true,currentWindow:true},tabs=>{
  const tab=tabs[0]; if(!tab){status.innerHTML='<p>⚠ No active tab.</p>';return;}
  chrome.tabs.sendMessage(tab.id,{type:'FILL'},response=>{
   if(chrome.runtime.lastError){status.innerHTML='<p style="color:#d63031">⚠ Refresh this page and try again.</p>';return;}
   status.innerHTML=response?.success?`<p style="color:#15956d">✓ ${response.count} fields filled.</p>`:'<p style="color:#d63031">⚠ Autofill failed.</p>';
  });
 });
};
