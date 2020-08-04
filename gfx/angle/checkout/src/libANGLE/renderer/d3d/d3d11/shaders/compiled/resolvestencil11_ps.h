#if 0
//
// Generated by Microsoft (R) HLSL Shader Compiler 9.29.952.3111
//
//
//   fxc /nologo /E PS_ResolveStencil /T ps_4_1 /Fh
//    compiled/resolvestencil11_ps.h ResolveDepthStencil.hlsl
//
//
// Resource Bindings:
//
// Name                                 Type  Format         Dim Slot Elements
// ------------------------------ ---------- ------- ----------- ---- --------
// Stencil                           texture   uint2        2dMS    1        1
//
//
//
// Input signature:
//
// Name                 Index   Mask Register SysValue Format   Used
// -------------------- ----- ------ -------- -------- ------ ------
// SV_Position              0   xyzw        0      POS  float       
// TEXCOORD                 0   xy          1     NONE  float   xy  
//
//
// Output signature:
//
// Name                 Index   Mask Register SysValue Format   Used
// -------------------- ----- ------ -------- -------- ------ ------
// SV_Target                0   xy          0   TARGET  float   xy  
//
ps_4_1
dcl_globalFlags refactoringAllowed
dcl_resource_texture2dms(0) (uint,uint,uint,uint) t1
dcl_input_ps linear v1.xy
dcl_output o0.xy
dcl_temps 1
resinfo_uint r0.xy, l(0), t1.xyzw
utof r0.xy, r0.xyxx
mul r0.xy, r0.xyxx, v1.xyxx
ftou r0.xy, r0.xyxx
mov r0.zw, l(0,0,0,0)
ldms r0.x, r0.xyzw, t1.yxzw, l(0)
utof o0.y, r0.x
mov o0.x, l(0)
ret 
// Approximately 9 instruction slots used
#endif

const BYTE g_PS_ResolveStencil[] = {
    68,  88,  66,  67,  23,  194, 195, 209, 212, 28,  208, 37,  42,  21,  191, 206, 191, 0,   52,
    120, 1,   0,   0,   0,   208, 2,   0,   0,   5,   0,   0,   0,   52,  0,   0,   0,   180, 0,
    0,   0,   12,  1,   0,   0,   64,  1,   0,   0,   84,  2,   0,   0,   82,  68,  69,  70,  120,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   28,  0,   0,   0,
    1,   4,   255, 255, 0,   1,   0,   0,   68,  0,   0,   0,   60,  0,   0,   0,   2,   0,   0,
    0,   4,   0,   0,   0,   6,   0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   1,   0,
    0,   0,   5,   0,   0,   0,   83,  116, 101, 110, 99,  105, 108, 0,   77,  105, 99,  114, 111,
    115, 111, 102, 116, 32,  40,  82,  41,  32,  72,  76,  83,  76,  32,  83,  104, 97,  100, 101,
    114, 32,  67,  111, 109, 112, 105, 108, 101, 114, 32,  57,  46,  50,  57,  46,  57,  53,  50,
    46,  51,  49,  49,  49,  0,   171, 171, 171, 73,  83,  71,  78,  80,  0,   0,   0,   2,   0,
    0,   0,   8,   0,   0,   0,   56,  0,   0,   0,   0,   0,   0,   0,   1,   0,   0,   0,   3,
    0,   0,   0,   0,   0,   0,   0,   15,  0,   0,   0,   68,  0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   3,   0,   0,   0,   1,   0,   0,   0,   3,   3,   0,   0,   83,  86,  95,
    80,  111, 115, 105, 116, 105, 111, 110, 0,   84,  69,  88,  67,  79,  79,  82,  68,  0,   171,
    171, 171, 79,  83,  71,  78,  44,  0,   0,   0,   1,   0,   0,   0,   8,   0,   0,   0,   32,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   3,   0,   0,   0,   0,   0,   0,   0,
    3,   12,  0,   0,   83,  86,  95,  84,  97,  114, 103, 101, 116, 0,   171, 171, 83,  72,  68,
    82,  12,  1,   0,   0,   65,  0,   0,   0,   67,  0,   0,   0,   106, 8,   0,   1,   88,  32,
    0,   4,   0,   112, 16,  0,   1,   0,   0,   0,   68,  68,  0,   0,   98,  16,  0,   3,   50,
    16,  16,  0,   1,   0,   0,   0,   101, 0,   0,   3,   50,  32,  16,  0,   0,   0,   0,   0,
    104, 0,   0,   2,   1,   0,   0,   0,   61,  16,  0,   7,   50,  0,   16,  0,   0,   0,   0,
    0,   1,   64,  0,   0,   0,   0,   0,   0,   70,  126, 16,  0,   1,   0,   0,   0,   86,  0,
    0,   5,   50,  0,   16,  0,   0,   0,   0,   0,   70,  0,   16,  0,   0,   0,   0,   0,   56,
    0,   0,   7,   50,  0,   16,  0,   0,   0,   0,   0,   70,  0,   16,  0,   0,   0,   0,   0,
    70,  16,  16,  0,   1,   0,   0,   0,   28,  0,   0,   5,   50,  0,   16,  0,   0,   0,   0,
    0,   70,  0,   16,  0,   0,   0,   0,   0,   54,  0,   0,   8,   194, 0,   16,  0,   0,   0,
    0,   0,   2,   64,  0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   46,  0,   0,   9,   18,  0,   16,  0,   0,   0,   0,   0,   70,  14,  16,  0,
    0,   0,   0,   0,   22,  126, 16,  0,   1,   0,   0,   0,   1,   64,  0,   0,   0,   0,   0,
    0,   86,  0,   0,   5,   34,  32,  16,  0,   0,   0,   0,   0,   10,  0,   16,  0,   0,   0,
    0,   0,   54,  0,   0,   5,   18,  32,  16,  0,   0,   0,   0,   0,   1,   64,  0,   0,   0,
    0,   0,   0,   62,  0,   0,   1,   83,  84,  65,  84,  116, 0,   0,   0,   9,   0,   0,   0,
    1,   0,   0,   0,   0,   0,   0,   0,   2,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   1,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   2,   0,   0,   0,
    0,   0,   0,   0,   3,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,
    0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0,   0};
