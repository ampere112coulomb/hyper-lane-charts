export function githubReady(config){return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repo||'')&&!!config.token;}
function api(config,fetcher){if(!githubReady(config))throw Error('GitHub転送の設定がまだ完了していません。元のZIPは保持しています。');const base=`https://api.github.com/repos/${config.repo}`;
 return async(path,options={})=>{const response=await fetcher(base+path,{...options,headers:{Accept:'application/vnd.github+json','User-Agent':'HyperLane-ChartLibrary','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${config.token}`,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},redirect:'error'});if(response.status===404&&options.missingOK)return null;if(!response.ok)throw Error(`GitHubとの通信に失敗しました (${response.status})。元のZIPは削除していません。`);return response.status===204?null:response.json();};}
export async function publishPackage(config,row,bytes,fetcher=fetch){
 const request=api(config,fetcher),tag=`chart-${row.id}`,name='chart.zip';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 let release=await request(`/releases/tags/${encodeURIComponent(tag)}`,{missingOK:true});
 if(!release)release=await request('/releases',{method:'POST',body:JSON.stringify({tag_name:tag,name:String(row.title).replace(/[\r\n]/g,' ').slice(0,200),body:'Approved community chart package for Hyper Lane.\nDistribution permissions are provided by the uploader.\nhttps://hyper-lane-chart-hub.arcane-bard-0210.chatgpt.site/',draft:true,prerelease:false,make_latest:'false'})});
 if(!Number.isSafeInteger(release.id))throw Error('GitHubリリースを確認できません。');
 let asset=(await request(`/releases/${release.id}/assets?per_page=100`)).find(a=>a.name===name);
 const matches=a=>a&&a.state==='uploaded'&&a.size===bytes.byteLength&&a.digest===`sha256:${hash}`;
 if(asset&&!matches(asset)){throw Error('GitHub上のZIPが元のファイルと一致しません。元のZIPを保持しています。');}
 if(!asset){const response=await fetcher(`https://uploads.github.com/repos/${config.repo}/releases/${release.id}/assets?name=${name}`,{method:'POST',headers:{Accept:'application/vnd.github+json','Content-Type':'application/zip','User-Agent':'HyperLane-ChartLibrary','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${config.token}`},body:bytes,redirect:'error'});if(!response.ok)throw Error(`ZIPのGitHub転送に失敗しました (${response.status})。元のZIPは保持しています。`);asset=await response.json();}
 // Verify GitHub's stored asset, not only the upload response, before publishing or deleting R2.
 asset=await request(`/releases/assets/${asset.id}`);
 if(!matches(asset))throw Error('転送後のZIPのサイズ・ハッシュが一致しません。元のZIPは保持しています。');
 const expected=`https://github.com/${config.repo}/releases/download/${tag}/${name}`;
 if(asset.browser_download_url!==expected)throw Error('ダウンロード先の検証に失敗しました。');
 if(release.draft)release=await request(`/releases/${release.id}`,{method:'PATCH',body:JSON.stringify({draft:false,make_latest:'false'})});
 if(release.draft)throw Error('GitHubリリースがまだ非公開です。');
 return {releaseId:release.id,assetId:asset.id,downloadUrl:expected};
}
export async function deletePackage(config,row,fetcher=fetch){
 const request=api(config,fetcher),tag=`chart-${row.id}`;
 const release=await request(`/releases/tags/${encodeURIComponent(tag)}`,{missingOK:true});
 if(release){if(row.github_release_id&&release.id!==row.github_release_id)throw Error('削除対象のリリースが一致しません。');await request(`/releases/${release.id}`,{method:'DELETE',missingOK:true});}
 await request(`/git/refs/tags/${encodeURIComponent(tag)}`,{method:'DELETE',missingOK:true});
}
