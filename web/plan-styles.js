'use strict';
const styles={
 a:{title:'A · 精细矢量彩平',description:'线条清晰、树冠层次明确，适合工作台标注与矢量绘图方向。'},
 b:{title:'B · 自然植物彩平',description:'植物轮廓与林下纹理更丰富，适合突出植物层次和自然氛围。'},
 c:{title:'C · 手绘水彩',description:'柔和水彩与细线结合，适合概念方案和汇报展示。'},
 d:{title:'D · 写实材质彩平',description:'叶片、铺装与阴影更接近真实俯视效果，适合图片化展示。'}
};
const image=document.getElementById('reference-image'),status=document.getElementById('image-status');
let current='a';
function choose(){const key=location.hash.slice(1).toLowerCase();if(!styles[key])return;current=key;document.getElementById('style-title').textContent=styles[key].title;document.getElementById('style-description').textContent=styles[key].description;document.getElementById('original').href='assets/plan-references/'+key+'.png';document.querySelectorAll('[data-style]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.style===key)));status.textContent='正在载入 '+key.toUpperCase()+' 原图，请稍候…';image.alt=styles[key].title+'风格参考';image.src='assets/plan-references/'+key+'.png';}
function loaded(){status.textContent=current.toUpperCase()+' 原图已载入，可点击“打开原图”放大或另存。';}
image.addEventListener('load',loaded);image.addEventListener('error',()=>status.textContent='预览未载入，请点击“打开原图”单独查看，或稍后刷新。');
document.addEventListener('click',event=>{const button=event.target.closest('[data-style]');if(button)location.hash=button.dataset.style;});window.addEventListener('hashchange',choose);choose();if(image.complete&&image.naturalWidth)loaded();
