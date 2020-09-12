// sysinfo.cpp : 此文件包含 "main" 函数。程序执行将在此处开始并结束。
//
#include <stdio.h>
#include <string.h>
#include <winsock2.h>
#include <Iphlpapi.h>
#pragma comment(lib, "Iphlpapi.lib")
#include <winsock2.h>
#pragma comment(lib, "ws2_32.lib")



int getOpts(int argc, char** argv);

void byte2Hex(unsigned char bData, unsigned char hex[]) {
  int high = bData / 16, low = bData % 16;
  hex[0] = (high < 10) ? ('0' + high) : ('A' + high - 10);
  hex[1] = (low < 10) ? ('0' + low) : ('A' + low - 10);
}

bool getLocalMac1(unsigned char* mac)  //获取本机MAC址
{
  ULONG ulSize = 0;
  PIP_ADAPTER_INFO pInfo = NULL;
  int temp = GetAdaptersInfo(pInfo, &ulSize);  //第一处调用，获取缓冲区大小
  pInfo = (PIP_ADAPTER_INFO)malloc(ulSize);
  temp = GetAdaptersInfo(pInfo, &ulSize);
  int iCount = 0;
  while (pInfo)  //遍历每一张网卡
  {
    //  pInfo->Address MAC址
    for (int i = 0; i < (int)pInfo->AddressLength; i++) {
      byte2Hex(pInfo->Address[i], &mac[iCount]);
      iCount += 2;
      if (i < (int)pInfo->AddressLength - 1) {
        mac[iCount++] = ':';
      } else {
        mac[iCount++] = '#';
      }
    }
    break;
    pInfo = pInfo->Next;
  }
  free(pInfo);

  if (iCount > 0) {
    mac[--iCount] = '\0';
    return true;
  } else {
    return false;
  }
}

//通过GetAdaptersInfo函数（适用于Windows 2000及以上版本）
bool getLocalMac2(unsigned char* mac) {
  bool ret = false;
  ULONG ulOutBufLen = sizeof(IP_ADAPTER_INFO);
  PIP_ADAPTER_INFO pAdapterInfo =
      (IP_ADAPTER_INFO*)malloc(sizeof(IP_ADAPTER_INFO));
  if (pAdapterInfo == NULL) return false;
  // Make an initial call to GetAdaptersInfo to get the necessary size into the
  // ulOutBufLen variable
  if (GetAdaptersInfo(pAdapterInfo, &ulOutBufLen) == ERROR_BUFFER_OVERFLOW) {
    free(pAdapterInfo);
    pAdapterInfo = (IP_ADAPTER_INFO*)malloc(ulOutBufLen);
    if (pAdapterInfo == NULL) return false;
  }
  if (GetAdaptersInfo(pAdapterInfo, &ulOutBufLen) == NO_ERROR) {
    for (PIP_ADAPTER_INFO pAdapter = pAdapterInfo; pAdapter != NULL;
         pAdapter = pAdapter->Next) {
      // 确保是以太网
      if (pAdapter->Type != MIB_IF_TYPE_ETHERNET) continue;
      // 确保MAC地址的长度为 00-00-00-00-00-00
      if (pAdapter->AddressLength != 6) continue;
      char acMAC[20] = {0};
      sprintf_s(acMAC, 20, "%02X:%02X:%02X:%02X:%02X:%02X", int(pAdapter->Address[0]),
              int(pAdapter->Address[1]), int(pAdapter->Address[2]),
              int(pAdapter->Address[3]), int(pAdapter->Address[4]),
              int(pAdapter->Address[5]));
      memcpy(mac, acMAC, 20);
      ret = true;
      break;
    }
  }
  free(pAdapterInfo);
  return ret;
}

//通过GetAdaptersAddresses函数（适用于Windows XP及以上版本）
bool getLocalMac3(unsigned char* mac) {
  bool ret = false;
  ULONG outBufLen = sizeof(IP_ADAPTER_ADDRESSES);
  PIP_ADAPTER_ADDRESSES pAddresses = (IP_ADAPTER_ADDRESSES*)malloc(outBufLen);
  if (pAddresses == NULL) return false;
  // Make an initial call to GetAdaptersAddresses to get the necessary size into
  // the ulOutBufLen variable
  if (GetAdaptersAddresses(AF_UNSPEC, 0, NULL, pAddresses, &outBufLen) ==
      ERROR_BUFFER_OVERFLOW) {
    free(pAddresses);
    pAddresses = (IP_ADAPTER_ADDRESSES*)malloc(outBufLen);
    if (pAddresses == NULL) return false;
  }

  if (GetAdaptersAddresses(AF_UNSPEC, 0, NULL, pAddresses, &outBufLen) ==
      NO_ERROR) {
    // If successful, output some information from the data we received
    for (PIP_ADAPTER_ADDRESSES pCurrAddresses = pAddresses;
         pCurrAddresses != NULL; pCurrAddresses = pCurrAddresses->Next) {
      // 确保MAC地址的长度为 00-00-00-00-00-00
      if (pCurrAddresses->PhysicalAddressLength != 6) continue;
      char acMAC[20] = {0};
      sprintf_s(acMAC, 20, "%02X:%02X:%02X:%02X:%02X:%02X",
              int(pCurrAddresses->PhysicalAddress[0]),
              int(pCurrAddresses->PhysicalAddress[1]),
              int(pCurrAddresses->PhysicalAddress[2]),
              int(pCurrAddresses->PhysicalAddress[3]),
              int(pCurrAddresses->PhysicalAddress[4]),
              int(pCurrAddresses->PhysicalAddress[5]));
      memcpy(mac, acMAC, 20);
      ret = true;
      break;
    }
  }
  free(pAddresses);
  return ret;
}

bool GetLocalIP(char* ip) {
  // 1.初始化wsa
  WSADATA wsaData;
  int ret = WSAStartup(MAKEWORD(2, 2), &wsaData);
  if (ret != 0) {
    return false;
  }
  // 2.获取主机名
  char hostname[256];
  ret = gethostname(hostname, sizeof(hostname));
  if (ret == SOCKET_ERROR) {
    return false;
  }
  // 3.获取主机ip
  HOSTENT* host = gethostbyname(hostname);
  if (host == NULL) {
    return false;
  }
  // 4.转化为char*并拷贝返回
  strcpy_s(ip, 30, inet_ntoa(*(in_addr*)*host->h_addr_list));
  return true;
}

int main(int argc, char* argv[]) {
  if (1 != getOpts(argc, argv)) {
    printf("e.g.\nsysinfo.exe --getmac --getlocalip\n");
  }
  return 0;
}

int getOpts(int argc, char** argv) {
  int hasMac = 0;
  int hasLocalIp = 0;
  unsigned char szMac[20] = {0};
  for (int i = 1; i < argc; i++) {
    if (!strcmp(argv[i], "--getmac")) {
      //为了确保获取到MAC地址，通过三种方式来获取
      if (!getLocalMac3(szMac)) {
        if (!getLocalMac2(szMac)) {
          getLocalMac1(szMac);
        }
      }
      printf("%s", szMac);
      //char envMAC[42] = {0};
      //sprintf_s(envMAC, 42, "firemail_os_info_mac=%s", szMac);
      //int ret = _putenv(envMAC); //程序级环境变量,只好写入文件，再从文件中读取了
      //printf("\n%d", ret);

      //char* buf = nullptr;
      size_t sz = 0;
      //if (_dupenv_s(&buf, &sz, "firemail_os_info_mac") == 0 && buf != nullptr) {
        //printf("firemail_os_info_mac = %s\n", buf);
        //free(buf);
      //}
      char* app_data = nullptr;
      if (_dupenv_s(&app_data, &sz, "APPDATA") == 0 && app_data != nullptr) {
        // printf("firemail_os_info_mac = %s\n", buf);
        char configFile[256] = {0};
        sprintf_s(configFile, 256, "%s\\Firemail\\fmconfig.ini", app_data);
        free(app_data);
        WritePrivateProfileStringA("OSINFO", "mac", (char*)szMac, configFile);

        char ip[30] = {0};
        if (GetLocalIP(ip)) {
          WritePrivateProfileStringA("OSINFO", "localip", ip, configFile);
          //printf("%s", ip);
        } else {
          //printf("%s", "0.0.0.0");
        }
      }
      hasMac = 1;
    } else if (!strcmp(argv[i], "--getlocalip")) {
      char ip[30] = {0};
      if (GetLocalIP(ip)) {
        printf("%s", ip);
      } else {
        printf("%s", "0.0.0.0");
      }
      hasLocalIp = 1;
    } else {
      return -1;
    }
  }
  return hasMac || hasLocalIp;
}

