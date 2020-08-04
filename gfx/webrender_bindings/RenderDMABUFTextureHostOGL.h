/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MOZILLA_GFX_RENDERDMABUFTEXTUREHOSTOGL_H
#define MOZILLA_GFX_RENDERDMABUFTEXTUREHOSTOGL_H

#include "mozilla/layers/TextureHostOGL.h"
#include "RenderTextureHostOGL.h"
#include "mozilla/widget/DMABufSurface.h"

namespace mozilla {

namespace layers {
class SurfaceDescriptorDMABuf;
}

namespace wr {

class RenderDMABUFTextureHostOGL final : public RenderTextureHostOGL {
 public:
  explicit RenderDMABUFTextureHostOGL(DMABufSurface* aSurface);

  wr::WrExternalImage Lock(uint8_t aChannelIndex, gl::GLContext* aGL,
                           wr::ImageRendering aRendering) override;
  void Unlock() override;

  gfx::IntSize GetSize(uint8_t aChannelIndex) const override;
  GLuint GetGLHandle(uint8_t aChannelIndex) const override;

 private:
  virtual ~RenderDMABUFTextureHostOGL();
  void DeleteTextureHandle();

  RefPtr<DMABufSurface> mSurface;
  RefPtr<gl::GLContext> mGL;
};

}  // namespace wr
}  // namespace mozilla

#endif  // MOZILLA_GFX_RENDERDMABUFTEXTUREHOSTOGL_H
