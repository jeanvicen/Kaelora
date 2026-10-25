import { describe, expect, it } from 'vitest';
import { Palette, VoxelGrid, buildVoxelGeometry } from '../src/render/voxel.ts';

function mesh(grid: VoxelGrid, palette: Palette) {
  const geo = buildVoxelGeometry({ grid, palette }, { scale: 1, ao: 0 });
  return {
    quads: geo.getIndex()!.count / 6,
    verts: geo.getAttribute('position').count,
    outline: geo.getAttribute('aOutline'),
  };
}

describe('gerador voxel', () => {
  it('um voxel sozinho vira um cubo de 6 faces', () => {
    const p = new Palette();
    const g = new VoxelGrid(3, 3, 3);
    g.set(1, 1, 1, p.add(0xff0000));
    const m = mesh(g, p);
    expect(m.quads).toBe(6);
    expect(m.verts).toBe(24);
  });

  it('remove faces internas e junta faces iguais (greedy)', () => {
    const p = new Palette();
    const g = new VoxelGrid(4, 4, 4);
    g.box(0, 0, 0, 4, 4, 4, p.add(0x00ff00));
    // 64 voxels de uma cor só: só 6 quads no total
    expect(mesh(g, p).quads).toBe(6);
  });

  it('cores diferentes não se juntam, mas a face entre elas some', () => {
    const p = new Palette();
    const a = p.add(0xff0000);
    const b = p.add(0x0000ff);
    const g = new VoxelGrid(2, 1, 1);
    g.set(0, 0, 0, a);
    g.set(1, 0, 0, b);
    // 2 cubos encostados: 10 faces visíveis, sendo 4 laterais de cada cor + 2 pontas
    expect(mesh(g, p).quads).toBe(10);
  });

  it('normais do contorno são unitárias', () => {
    const p = new Palette();
    const g = new VoxelGrid(5, 5, 5);
    g.sphere(2.5, 2.5, 2.5, 2.4, p.add(0xffffff));
    const { outline } = mesh(g, p);
    for (let i = 0; i < outline.count; i++) {
      const l = Math.hypot(outline.getX(i), outline.getY(i), outline.getZ(i));
      expect(l).toBeGreaterThan(0.99);
      expect(l).toBeLessThan(1.01);
    }
  });

  it('paleta reaproveita cores repetidas', () => {
    const p = new Palette();
    expect(p.add(0x123456)).toBe(p.add(0x123456));
    expect(p.add(0x123456, { glow: 1 })).not.toBe(p.add(0x123456));
  });
});
