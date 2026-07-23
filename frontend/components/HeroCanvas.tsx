'use client';
import React, { useEffect, useRef } from 'react';

/**
 * پس‌زمینهٔ سه‌بعدی ظریف کارت «جلسهٔ بعدی»: شبکه‌ای از ذرات سبز شناور (Three.js).
 * - three به‌صورت dynamic import لود می‌شود تا وارد باندل اولیه نشود.
 * - در prefers-reduced-motion اصلاً رندر نمی‌شود؛ در تب مخفی متوقف می‌شود.
 */
export default function HeroCanvas() {
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
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
      camera.position.z = 9;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch {
        return; // WebGL در دسترس نیست — کارت بدون پس‌زمینهٔ سه‌بعدی هم کامل است
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
      host.appendChild(renderer.domElement);

      // ذرات
      const COUNT = 70;
      const positions = new Float32Array(COUNT * 3);
      const speeds: number[] = [];
      for (let i = 0; i < COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 16;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        speeds.push(0.15 + Math.random() * 0.35);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0x34d399, size: 0.09, transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);

      // خطوط اتصال کم‌رنگ بین ذرات نزدیک (یک‌بار محاسبه، حس «شبکهٔ پرداخت»)
      const linePos: number[] = [];
      for (let i = 0; i < COUNT; i++) {
        for (let j = i + 1; j < COUNT; j++) {
          const dx = positions[i * 3] - positions[j * 3];
          const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
          const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
          if (dx * dx + dy * dy + dz * dz < 4.6) {
            linePos.push(
              positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
              positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2],
            );
          }
        }
      }
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linePos), 3));
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x2fbe89, transparent: true, opacity: 0.14, depthWrite: false,
      });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      scene.add(lines);

      const clock = new THREE.Clock();
      let pointerX = 0;
      const onPointer = (e: PointerEvent) => {
        const r = host.getBoundingClientRect();
        pointerX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      };
      host.addEventListener('pointermove', onPointer, { passive: true });

      const tick = () => {
        if (document.hidden) { raf = requestAnimationFrame(tick); return; }
        const t = clock.getElapsedTime();
        const pos = geo.attributes.position.array as Float32Array;
        for (let i = 0; i < COUNT; i++) {
          pos[i * 3 + 1] += Math.sin(t * speeds[i] + i) * 0.0022;
        }
        geo.attributes.position.needsUpdate = true;
        const targetY = pointerX * 0.12 + t * 0.02;
        points.rotation.y += (targetY - points.rotation.y) * 0.05;
        lines.rotation.y = points.rotation.y;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const onResize = () => {
        const { clientWidth: nw, clientHeight: nh } = host;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(host);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        host.removeEventListener('pointermove', onPointer);
        geo.dispose(); mat.dispose(); lineGeo.dispose(); lineMat.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => { disposed = true; cleanup?.(); };
  }, []);

  return <div ref={hostRef} aria-hidden className="hero-canvas" />;
}
