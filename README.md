# Firemail_Mozilla
基于Mozilla平台的邮件客户端

子模块相关执行命令
git submodule init
git submodule update
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_dom.git dom
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_js.git js
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_layout.git layout
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_media.git media
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_security.git security
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_toolkit.git toolkit
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_third_party.git third_party
git submodule add https://github.com/zhaomokeji/Firemail_Mozilla_testing.git testing
或
git submodule update --init --recursive
如果新更新的子模块内容没有拉下来，则直接进入相关模块执行
如dom模块：
cd dom
git pull


删除子模块较复杂，步骤如下：

rm -rf 子模块目录 删除子模块目录及源码
vi .gitmodules 删除项目目录下.gitmodules文件中子模块相关条目
vi .git/config 删除配置项中子模块相关条目
rm -fr .git/modules/* 删除模块下的子模块目录，每个子模块对应一个目录，注意只删除对应的子模块目录即可
