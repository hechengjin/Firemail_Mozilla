C:\Program Files (x86)\Microsoft Visual Studio\2019\Professional\VC\Tools\MSVC\14.26.28801\bin\Hostx86\x86\vcruntime140.dll


静态编译 

项目->项目属性->配置属性->C/C++->代码生成->运行库中四个选项的关系： 
多线程调试Dll (/MDd) 对应——-MD_DynamicDebug 
多线程Dll (/MD) 对应————-MD_DynamicRelease 
多线程(/MT) 对应—————–MD_StaticRelease               ***********
多线程(/MTd)对应—————-MD_StaticDebug