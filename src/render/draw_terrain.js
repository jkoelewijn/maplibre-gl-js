// @flow

import StencilMode from '../gl/stencil_mode';
import DepthMode from '../gl/depth_mode';
import SegmentVector from '../data/segment';
import {terrainUniformValues} from './program/terrain_program';
import type Painter from './painter';
import type TerranSourceCache from '../source/terrain_source_cache';
import CullFaceMode from '../gl/cull_face_mode';
import pos3DAttributes from '../data/pos3d_attributes';
import Texture from './texture';
import Color from '../style-spec/util/color';
import ColorMode from '../gl/color_mode';
import browser from '../util/browser';

function drawTerrainCoords(painter, sourceCache: TerrainSourceCache) {
   const tiles = Object.values(sourceCache._tiles).filter(t => t.unprojectTileID && t.coordsTexture);
   if (!tiles.length) return;

   const context = painter.context;
   const gl = context.gl;
   const colorMode = ColorMode.unblended;
   const program = painter.useProgram('terrain');

   // draw tile-coords into framebuffer
   context.bindFramebuffer.set(sourceCache.getCoordsFramebuffer(painter.context).framebuffer);
   context.viewport.set([0, 0, painter.width / browser.devicePixelRatio, painter.height / browser.devicePixelRatio]);

   for (const tile of tiles) {
      context.activeTexture.set(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tile.coordsTexture.texture);
      const depthMode = new DepthMode(gl.LEQUAL, DepthMode.ReadWrite, painter.depthRangeFor3D);
      const posMatrix = painter.transform.calculatePosMatrix(tile.unprojectTileID.toUnwrapped());
      program.draw(context, gl.TRIANGLES, depthMode, StencilMode.disabled, colorMode, CullFaceMode.backCCW,
          terrainUniformValues(posMatrix), "terrain", tile.vertexBuffer, tile.indexBuffer, tile.segments);
      tile.unprojectTileID = null;
   }
}

function drawTerrain(painter: Painter, sourceCache: TerrainSourceCache) {
    const tiles = Object.values(sourceCache._tiles).filter(t => t.needsRedraw);
    if (!tiles.length) return;

    const context = painter.context;
    const gl = context.gl;
    const colorMode = painter.colorModeForRenderPass();
    const program = painter.useProgram('terrain');

    for (const tile of tiles) {
        tile.needsRedraw = false;
        context.activeTexture.set(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tile.fbo.colorAttachment.get());
        const depthMode = new DepthMode(gl.LEQUAL, DepthMode.ReadWrite, painter.depthRangeFor3D);
        const posMatrix = painter.transform.calculatePosMatrix(tile.tileID.toUnwrapped());
        program.draw(context, gl.TRIANGLES, depthMode, StencilMode.disabled, colorMode, CullFaceMode.backCCW,
            terrainUniformValues(posMatrix), "terrain", tile.vertexBuffer, tile.indexBuffer, tile.segments);
    }
}

function prepareTerrain(painter: Painter, sourceCache: TerrainSourceCache, depth: number=1) {
   const context = painter.context;
   for (const tileID of sourceCache.getRenderableTileIDs(painter.transform)) {
      const tile = sourceCache.getTileByID(tileID);
      if (!tile.fbo) {
         // FIXME! adjust size for overzooming
         context.activeTexture.set(context.gl.TEXTURE0);
         tile.texture = new Texture(context, {width: 1024, height: 1024, data: null}, context.gl.RGBA);
         tile.texture.bind(context.gl.LINEAR, context.gl.CLAMP_TO_EDGE);
         tile.fbo = context.createFramebuffer(1024, 1024, true);
         tile.fbo.colorAttachment.set(tile.texture.texture);
         tile.fbo.depthAttachment.set(context.createRenderbuffer(context.gl.DEPTH_COMPONENT16, 1024, 1024));
      }
      if (!tile.segments) {
         tile.indexBuffer = context.createIndexBuffer(tile.mesh.indexArray);
         tile.vertexBuffer = context.createVertexBuffer(tile.mesh.vertexArray, pos3DAttributes.members);
         tile.segments = SegmentVector.simpleSegment(0, 0, tile.mesh.vertexArray.length, tile.mesh.indexArray.length);
      }
      if (!tile.coordsTexture) {
         tile.coordsTexture = new Texture(context, tile.coords, context.gl.RGBA, {premultiply: false});
         tile.coordsTexture.bind(context.gl.NEAREST, context.gl.CLAMP_TO_EDGE);
      }
      // empty framebuffer
      context.bindFramebuffer.set(tile.fbo.framebuffer);
      context.clear({ color: Color.transparent, depth: depth });
      painter.finishFramebuffer();
   }
}

export {
   prepareTerrain,
   drawTerrain,
   drawTerrainCoords
};
