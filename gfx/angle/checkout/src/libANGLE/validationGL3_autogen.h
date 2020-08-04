// GENERATED FILE - DO NOT EDIT.
// Generated by generate_entry_points.py using data from gl.xml and wgl.xml.
//
// Copyright 2019 The ANGLE Project Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// validationGL3_autogen.h:
//   Validation functions for the OpenGL 3.0 entry points.

#ifndef LIBANGLE_VALIDATION_GL3_AUTOGEN_H_
#define LIBANGLE_VALIDATION_GL3_AUTOGEN_H_

#include "common/PackedEnums.h"

namespace gl
{
class Context;

bool ValidateBeginConditionalRender(Context *context, GLuint id, GLenum mode);
bool ValidateBindFragDataLocation(Context *context,
                                  GLuint program,
                                  GLuint color,
                                  const GLchar *name);
bool ValidateClampColor(Context *context, GLenum target, GLenum clamp);
bool ValidateColorMaski(Context *context,
                        GLuint index,
                        GLboolean r,
                        GLboolean g,
                        GLboolean b,
                        GLboolean a);
bool ValidateDisablei(Context *context, GLenum target, GLuint index);
bool ValidateEnablei(Context *context, GLenum target, GLuint index);
bool ValidateEndConditionalRender(Context *context);
bool ValidateFramebufferTexture1D(Context *context,
                                  GLenum target,
                                  GLenum attachment,
                                  GLenum textarget,
                                  GLuint texture,
                                  GLint level);
bool ValidateFramebufferTexture3D(Context *context,
                                  GLenum target,
                                  GLenum attachment,
                                  TextureTarget textargetPacked,
                                  GLuint texture,
                                  GLint level,
                                  GLint zoffset);
bool ValidateGetTexParameterIiv(Context *context,
                                TextureType targetPacked,
                                GLenum pname,
                                GLint *params);
bool ValidateGetTexParameterIuiv(Context *context,
                                 TextureType targetPacked,
                                 GLenum pname,
                                 GLuint *params);
bool ValidateIsEnabledi(Context *context, GLenum target, GLuint index);
bool ValidateTexParameterIiv(Context *context,
                             TextureType targetPacked,
                             GLenum pname,
                             const GLint *params);
bool ValidateTexParameterIuiv(Context *context,
                              TextureType targetPacked,
                              GLenum pname,
                              const GLuint *params);
bool ValidateVertexAttribI1i(Context *context, GLuint index, GLint x);
bool ValidateVertexAttribI1iv(Context *context, GLuint index, const GLint *v);
bool ValidateVertexAttribI1ui(Context *context, GLuint index, GLuint x);
bool ValidateVertexAttribI1uiv(Context *context, GLuint index, const GLuint *v);
bool ValidateVertexAttribI2i(Context *context, GLuint index, GLint x, GLint y);
bool ValidateVertexAttribI2iv(Context *context, GLuint index, const GLint *v);
bool ValidateVertexAttribI2ui(Context *context, GLuint index, GLuint x, GLuint y);
bool ValidateVertexAttribI2uiv(Context *context, GLuint index, const GLuint *v);
bool ValidateVertexAttribI3i(Context *context, GLuint index, GLint x, GLint y, GLint z);
bool ValidateVertexAttribI3iv(Context *context, GLuint index, const GLint *v);
bool ValidateVertexAttribI3ui(Context *context, GLuint index, GLuint x, GLuint y, GLuint z);
bool ValidateVertexAttribI3uiv(Context *context, GLuint index, const GLuint *v);
bool ValidateVertexAttribI4bv(Context *context, GLuint index, const GLbyte *v);
bool ValidateVertexAttribI4sv(Context *context, GLuint index, const GLshort *v);
bool ValidateVertexAttribI4ubv(Context *context, GLuint index, const GLubyte *v);
bool ValidateVertexAttribI4usv(Context *context, GLuint index, const GLushort *v);
}  // namespace gl

#endif  // LIBANGLE_VALIDATION_GL3_AUTOGEN_H_
