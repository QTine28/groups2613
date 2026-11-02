/* Inverse of the native Hor+ camera. Sprite and board units retain one scale. */
'use strict';
(function(root,factory) {
    const api=factory();
    if (typeof module==='object' && module.exports) module.exports=api;
    else root.PvzWideLayout=api;
})(typeof window==='object' ? window : globalThis, function() {
    function backingSize(width,height,dpr=1) {
        const scale=Math.min(Math.max(1,Math.min(2,dpr||1)),4096/Math.max(1,width,height));
        return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
    }
    function viewport(width,height,wide) {
        let w=width,h=height;
        if (!wide || width*3<=height*4) {
            if (width*3>height*4) w=Math.floor(height*4/3);
            else if (width*3<height*4) h=Math.floor(width*3/4);
        }
        return {x:Math.floor((width-w)/2),y:height-Math.floor((height-h)/2)-h,width:w,height:h};
    }
    function mapPoint(state,box,clientX,clientY) {
        if (!state || state.version!==3 || !state.viewport || !box || box.width<=0 || box.height<=0 ||
            !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
        const p=state.viewport;
        if (![state.width,state.height,state.cameraLeft,state.logicalWidth,state.logicalHeight,
            p.x,p.y,p.width,p.height,box.left,box.top,box.width,box.height].every(Number.isFinite) ||
            !(state.width>0 && state.height>0 && p.width>0 && p.height>0 && state.logicalWidth>0 && state.logicalHeight>0)) return null;
        const x=(clientX-box.left)*state.width/box.width;
        const y=(clientY-box.top)*state.height/box.height;
        if (x<p.x || y<p.y || x>=p.x+p.width || y>=p.y+p.height) return null;
        return {x:Math.floor(state.cameraLeft+(x-p.x)*state.logicalWidth/p.width),
            y:Math.floor((y-p.y)*state.logicalHeight/p.height)};
    }
    return {backingSize,viewport,mapPoint};
});
