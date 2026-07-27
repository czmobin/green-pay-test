'use client';
import React, { useEffect, useRef } from 'react';

/**
 * پس‌زمینهٔ سه‌بعدی صفحهٔ ورود: کرهٔ سیمی چرخان با گره‌های نورانی —
 * استعارهٔ «شبکهٔ سازمانی» گرین‌پی.
 *
 * three به‌صورت dynamic import می‌آید تا وارد باندل اولیه نشود؛ در
 * prefers-reduced-motion ساخته نمی‌شود و در تب مخفی رندر متوقف می‌شود.
 */
export default function LoginScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let raf = 0;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import('three');
      if (disposed || !hostRef.current) return;

      const { clientWidth: w, clientHeight: h } = host;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.z = 6.4;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch {
        return;  // بدون WebGL، صفحه با گرادیان پس‌زمینه کامل است
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      host.appendChild(renderer.domElement);

      const group = new THREE.Group();
      scene.add(group);

      // کرهٔ سیمی
      const sphereGeo = new THREE.IcosahedronGeometry(2.1, 3);
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(sphereGeo),
        new THREE.LineBasicMaterial({ color: 0x2fbe89, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      group.add(wire);

      // گره‌های نورانی روی سطح کره
      const NODES = 90;
      const nodePos = new Float32Array(NODES * 3);
      for (let i = 0; i < NODES; i++) {
        // توزیع یکنواخت روی کره (فیبوناچی)
        const t = (i + 0.5) / NODES;
        const phi = Math.acos(1 - 2 * t);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        const r = 2.12;
        nodePos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        nodePos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        nodePos[i * 3 + 2] = r * Math.cos(phi);
      }
      const nodeGeo = new THREE.BufferGeometry();
      nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3));
      const nodeMat = new THREE.PointsMaterial({
        color: 0x6ee7b7, size: 0.075, transparent: true, opacity: 0.9,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      group.add(new THREE.Points(nodeGeo, nodeMat));

      // غبار پیرامونی
      const DUST = 120;
      const dustPos = new Float32Array(DUST * 3);
      for (let i = 0; i < DUST; i++) {
        dustPos[i * 3] = (Math.random() - 0.5) * 13;
        dustPos[i * 3 + 1] = (Math.random() - 0.5) * 9;
        dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1.5;
      }
      const dustGeo = new THREE.BufferGeometry();
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
      const dustMat = new THREE.PointsMaterial({
        color: 0x34d399, size: 0.045, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const dust = new THREE.Points(dustGeo, dustMat);
      scene.add(dust);

      const clock = new THREE.Clock();
      let px = 0, py = 0;
      const onPointer = (e: PointerEvent) => {
        px = (e.clientX / window.innerWidth - 0.5) * 2;
        py = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (document.hidden) return;
        const t = clock.getElapsedTime();
        group.rotation.y += 0.0016;
        group.rotation.x = Math.sin(t * 0.18) * 0.12;
        // پارالاکس ملایم با حرکت نشانگر
        group.position.x += (px * 0.28 - group.position.x) * 0.04;
        group.position.y += (-py * 0.2 - group.position.y) * 0.04;
        dust.rotation.y = -t * 0.012;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(tick);

      const ro = new ResizeObserver(() => {
        const { clientWidth: nw, clientHeight: nh } = host;
        if (!nw || !nh) return;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      });
      ro.observe(host);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        window.removeEventListener('pointermove', onPointer);
        sphereGeo.dispose();
        wire.geometry.dispose();
        (wire.material as import('three').Material).dispose();
        nodeGeo.dispose(); nodeMat.dispose(); dustGeo.dispose(); dustMat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => { disposed = true; cleanup?.(); };
  }, []);

  return <div ref={hostRef} aria-hidden className="login-scene" />;
}
