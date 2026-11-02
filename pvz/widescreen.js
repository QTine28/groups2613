/* Direct native Hor+ presentation: original proportions and one input route. */
'use strict';
(() => {
    const geometry=window.PvzWideLayout;
    const stage=document.getElementById('game-stage');
    const canvas=document.getElementById('canvas');
    const toggle=document.getElementById('widescreen-toggle');
    let wideEnabled=true;
    try { wideEnabled=localStorage.getItem('pvz-true-wide-v3')!=='off'; } catch (_) { /* Optional storage. */ }
    let state=null;
    let pointerId=null;
    let frame=0;
    let requested='';
    function nativePointer(type,point) {
        if (!state || typeof Module._pvz_pointer!=='function') return;
        Module._pvz_pointer(type,point ? point.x : -1,point ? point.y : -1);
    }
    function cancelPointer() {
        const id=pointerId;
        pointerId=null;
        if (id!==null) {
            nativePointer(3,null);
            if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        }
    }
    function applySize() {
        frame=0;
        const box=stage.getBoundingClientRect();
        if (box.width<1 || box.height<1) return;
        const wide=wideEnabled && box.width*3>box.height*4;
        const backing=geometry.backingSize(box.width,box.height,window.devicePixelRatio||1);
        const key=[backing.width,backing.height,wide,box.width,box.height].join(':');
        canvas.style.width=box.width+'px';
        canvas.style.height=box.height+'px';
        stage.dataset.layout=wide ? 'wide' : 'contain';
        const nativeMatches=!state || (state.width===backing.width && state.height===backing.height && state.wide===wide);
        if ((key===requested && nativeMatches) || typeof Module._pvz_resize!=='function') return;
        cancelPointer();
        requested=key;
        // Native resize owns the drawing buffer and redraws even while paused.
        // Assigning canvas.width here would erase that newly drawn frame.
        Module._pvz_resize(backing.width,backing.height,wide?1:0);
        canvas.style.width=box.width+'px';
        canvas.style.height=box.height+'px';
    }
    function resize() {
        if (!frame) frame=requestAnimationFrame(applySize);
    }
    function present(source,next) {
        if (source!==canvas || !next || next.version!==3) return;
        state=next;
        // Resize only in a later rAF, outside the native rendering call stack.
        resize();
    }
    function pointFor(event) {
        return geometry.mapPoint(state,canvas.getBoundingClientRect(),event.clientX,event.clientY);
    }
    canvas.addEventListener('pointerdown',event => {
        if (pointerId!==null || (event.pointerType==='mouse' && event.button!==0)) return;
        const point=pointFor(event);
        if (!point) return;
        event.preventDefault();
        // Native input is queued. Restore the active text field inside this
        // real gesture so mobile browsers can open their on-screen keyboard.
        const keyboard=Module.wasmSoftKeyboardState?.active && document.getElementById('pvz-soft-keyboard');
        (keyboard || canvas).focus({preventScroll:true});
        pointerId=event.pointerId;
        canvas.setPointerCapture(pointerId);
        nativePointer(0,point);
        nativePointer(1,point);
    });
    canvas.addEventListener('pointermove',event => {
        if (pointerId!==null && event.pointerId!==pointerId) return;
        if (pointerId===null && event.pointerType!=='mouse') return;
        const point=pointFor(event);
        if (point) nativePointer(0,point);
        else if (pointerId===null) nativePointer(3,null);
        if (pointerId!==null) event.preventDefault();
    });
    canvas.addEventListener('pointerup',event => {
        if (event.pointerId!==pointerId) return;
        event.preventDefault();
        const point=pointFor(event);
        nativePointer(point?2:3,point);
        pointerId=null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    });
    const cancelMatchingPointer=event => { if (event.pointerId===pointerId) cancelPointer(); };
    canvas.addEventListener('pointercancel',cancelMatchingPointer);
    canvas.addEventListener('lostpointercapture',cancelMatchingPointer);
    canvas.addEventListener('pointerleave',() => { if (pointerId===null) nativePointer(3,null); });
    // SDL also registers compatibility listeners on this canvas and document.
    // Pointer events are the only mouse/touch path; keyboard remains with SDL.
    for (const type of ['mousedown','mouseup','mousemove','mouseenter','mouseleave','touchstart','touchmove','touchend','touchcancel']) {
        canvas.addEventListener(type,event => {
            if (!state) return;
            event.stopImmediatePropagation();
            if (event.cancelable) event.preventDefault();
        },{passive:false,capture:true});
    }
    canvas.addEventListener('contextmenu',event => event.preventDefault());
    document.addEventListener('visibilitychange',() => { if (document.hidden) cancelPointer(); });
    window.addEventListener('blur',cancelPointer);
    window.addEventListener('pvz:started',() => { requested=''; resize(); });
    window.addEventListener('pvz:stopped',() => { cancelPointer(); state=null; requested=''; });
    function renderToggle() {
        toggle.setAttribute('aria-pressed',String(wideEnabled));
        toggle.textContent=wideEnabled ? 'широкий экран: вкл' : 'широкий экран: выкл';
    }
    toggle.addEventListener('click',() => {
        cancelPointer();
        wideEnabled=!wideEnabled;
        try { localStorage.setItem('pvz-true-wide-v3',wideEnabled?'on':'off'); } catch (_) { /* Optional. */ }
        renderToggle();
        requested='';
        resize();
    });
    renderToggle();
    window.PvzWide={present,resize,cancelPointer};
})();
