/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set sw=2 ts=8 et tw=80 : */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#if !defined(__nsHTTPCompressConv__h__)
#  define __nsHTTPCompressConv__h__ 1

#  include "nsIStreamConverter.h"
#  include "nsICompressConvStats.h"
#  include "nsIThreadRetargetableStreamListener.h"
#  include "nsCOMPtr.h"
#  include "mozilla/Atomics.h"
#  include "mozilla/Mutex.h"

#  include "zlib.h"

// brotli includes
#  undef assert
#  include "assert.h"
#  include "state.h"

class nsIStringInputStream;

#  define NS_HTTPCOMPRESSCONVERTER_CID                 \
    {                                                  \
      /* 66230b2b-17fa-4bd3-abf4-07986151022d */       \
      0x66230b2b, 0x17fa, 0x4bd3, {                    \
        0xab, 0xf4, 0x07, 0x98, 0x61, 0x51, 0x02, 0x2d \
      }                                                \
    }

#  define HTTP_DEFLATE_TYPE "deflate"
#  define HTTP_GZIP_TYPE "gzip"
#  define HTTP_X_GZIP_TYPE "x-gzip"
#  define HTTP_COMPRESS_TYPE "compress"
#  define HTTP_X_COMPRESS_TYPE "x-compress"
#  define HTTP_BROTLI_TYPE "br"
#  define HTTP_IDENTITY_TYPE "identity"
#  define HTTP_UNCOMPRESSED_TYPE "uncompressed"

namespace mozilla {
namespace net {

typedef enum {
  HTTP_COMPRESS_GZIP,
  HTTP_COMPRESS_DEFLATE,
  HTTP_COMPRESS_COMPRESS,
  HTTP_COMPRESS_BROTLI,
  HTTP_COMPRESS_IDENTITY
} CompressMode;

class BrotliWrapper {
 public:
  BrotliWrapper()
      : mTotalOut(0),
        mStatus(NS_OK),
        mBrotliStateIsStreamEnd(false),
        mRequest(nullptr),
        mContext(nullptr),
        mSourceOffset(0) {
    BrotliDecoderStateInit(&mState, 0, 0, 0);
  }
  ~BrotliWrapper() { BrotliDecoderStateCleanup(&mState); }

  BrotliDecoderState mState;
  Atomic<size_t, Relaxed> mTotalOut;
  nsresult mStatus;
  Atomic<bool, Relaxed> mBrotliStateIsStreamEnd;

  nsIRequest* mRequest;
  nsISupports* mContext;
  uint64_t mSourceOffset;
};

class nsHTTPCompressConv : public nsIStreamConverter,
                           public nsICompressConvStats,
                           public nsIThreadRetargetableStreamListener {
 public:
  // nsISupports methods
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIREQUESTOBSERVER
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSICOMPRESSCONVSTATS
  NS_DECL_NSITHREADRETARGETABLESTREAMLISTENER

  // nsIStreamConverter methods
  NS_DECL_NSISTREAMCONVERTER

  nsHTTPCompressConv();

 private:
  virtual ~nsHTTPCompressConv();

  nsCOMPtr<nsIStreamListener>
      mListener;  // this guy gets the converted data via his OnDataAvailable ()
  Atomic<CompressMode, Relaxed> mMode;

  unsigned char* mOutBuffer;
  unsigned char* mInpBuffer;

  uint32_t mOutBufferLen;
  uint32_t mInpBufferLen;

  UniquePtr<BrotliWrapper> mBrotli;

  nsCOMPtr<nsIStringInputStream> mStream;

  static nsresult BrotliHandler(nsIInputStream* stream, void* closure,
                                const char* dataIn, uint32_t, uint32_t avail,
                                uint32_t* countRead);

  nsresult do_OnDataAvailable(nsIRequest* request, nsISupports* aContext,
                              uint64_t aSourceOffset, const char* buffer,
                              uint32_t aCount);

  bool mCheckHeaderDone;
  Atomic<bool> mStreamEnded;
  bool mStreamInitialized;
  bool mDummyStreamInitialised;
  bool mFailUncleanStops;

  z_stream d_stream;
  unsigned mLen, hMode, mSkipCount, mFlags;

  uint32_t check_header(nsIInputStream* iStr, uint32_t streamLen, nsresult* rv);

  Atomic<uint32_t, Relaxed> mDecodedDataLength;

  mutable mozilla::Mutex mMutex;
};

}  // namespace net
}  // namespace mozilla

#endif
