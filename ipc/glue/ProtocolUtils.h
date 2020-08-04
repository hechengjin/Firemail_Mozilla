/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#ifndef mozilla_ipc_ProtocolUtils_h
#define mozilla_ipc_ProtocolUtils_h 1

#include "base/process.h"
#include "base/process_util.h"
#include "chrome/common/ipc_message_utils.h"

#include "prenv.h"

#include "IPCMessageStart.h"
#include "mozilla/AlreadyAddRefed.h"
#include "mozilla/Attributes.h"
#include "mozilla/ipc/ByteBuf.h"
#include "mozilla/ipc/FileDescriptor.h"
#include "mozilla/ipc/MessageChannel.h"
#include "mozilla/ipc/Shmem.h"
#include "mozilla/ipc/Transport.h"
#include "mozilla/ipc/MessageLink.h"
#include "mozilla/LinkedList.h"
#include "mozilla/Maybe.h"
#include "mozilla/MozPromise.h"
#include "mozilla/Mutex.h"
#include "mozilla/NotNull.h"
#include "mozilla/Scoped.h"
#include "mozilla/UniquePtr.h"
#include "MainThreadUtils.h"

#include "nsDataHashtable.h"
#include "nsHashKeys.h"

#if defined(ANDROID) && defined(DEBUG)
#  include <android/log.h>
#endif

template <typename T>
class nsTHashtable;
template <typename T>
class nsPtrHashKey;

// WARNING: this takes into account the private, special-message-type
// enum in ipc_channel.h.  They need to be kept in sync.
namespace {
// XXX the max message ID is actually kuint32max now ... when this
// changed, the assumptions of the special message IDs changed in that
// they're not carving out messages from likely-unallocated space, but
// rather carving out messages from the end of space allocated to
// protocol 0.  Oops!  We can get away with this until protocol 0
// starts approaching its 65,536th message.
enum {
  IMPENDING_SHUTDOWN_MESSAGE_TYPE = kuint16max - 9,
  BUILD_IDS_MATCH_MESSAGE_TYPE = kuint16max - 8,
  BUILD_ID_MESSAGE_TYPE = kuint16max - 7,  // unused
  CHANNEL_OPENED_MESSAGE_TYPE = kuint16max - 6,
  SHMEM_DESTROYED_MESSAGE_TYPE = kuint16max - 5,
  SHMEM_CREATED_MESSAGE_TYPE = kuint16max - 4,
  GOODBYE_MESSAGE_TYPE = kuint16max - 3,
  CANCEL_MESSAGE_TYPE = kuint16max - 2,

  // kuint16max - 1 is used by ipc_channel.h.
};

}  // namespace

class nsISerialEventTarget;

namespace mozilla {
class SchedulerGroup;

namespace dom {
class ContentParent;
}  // namespace dom

namespace net {
class NeckoParent;
}  // namespace net

namespace ipc {

#ifdef FUZZING
class ProtocolFuzzerHelper;
#endif

class MessageChannel;

#ifdef XP_WIN
const base::ProcessHandle kInvalidProcessHandle = INVALID_HANDLE_VALUE;

// In theory, on Windows, this is a valid process ID, but in practice they are
// currently divisible by four. Process IDs share the kernel handle allocation
// code and they are guaranteed to be divisible by four.
// As this could change for process IDs we shouldn't generally rely on this
// property, however even if that were to change, it seems safe to rely on this
// particular value never being used.
const base::ProcessId kInvalidProcessId = kuint32max;
#else
const base::ProcessHandle kInvalidProcessHandle = -1;
const base::ProcessId kInvalidProcessId = -1;
#endif

// Scoped base::ProcessHandle to ensure base::CloseProcessHandle is called.
struct ScopedProcessHandleTraits {
  typedef base::ProcessHandle type;

  static type empty() { return kInvalidProcessHandle; }

  static void release(type aProcessHandle) {
    if (aProcessHandle && aProcessHandle != kInvalidProcessHandle) {
      base::CloseProcessHandle(aProcessHandle);
    }
  }
};
typedef mozilla::Scoped<ScopedProcessHandleTraits> ScopedProcessHandle;

class ProtocolFdMapping;
class ProtocolCloneContext;

// Used to pass references to protocol actors across the wire.
// Actors created on the parent-side have a positive ID, and actors
// allocated on the child side have a negative ID.
struct ActorHandle {
  int mId;
};

// What happens if Interrupt calls race?
enum RacyInterruptPolicy { RIPError, RIPChildWins, RIPParentWins };

enum class LinkStatus : uint8_t {
  // The actor has not established a link yet, or the actor is no longer in use
  // by IPC, and its 'Dealloc' method has been called or is being called.
  //
  // NOTE: This state is used instead of an explicit `Freed` state when IPC no
  // longer holds references to the current actor as we currently re-open
  // existing actors. Once we fix these poorly behaved actors, this loopback
  // state can be split to have the final state not be the same as the initial
  // state.
  Inactive,

  // A live link is connected to the other side of this actor.
  Connected,

  // The link has begun being destroyed. Messages may still be received, but
  // cannot be sent. (exception: sync/intr replies may be sent while Doomed).
  Doomed,

  // The link has been destroyed, and messages will no longer be sent or
  // received.
  Destroyed,
};

typedef IPCMessageStart ProtocolId;

// Generated by IPDL compiler
const char* ProtocolIdToName(IPCMessageStart aId);

class IToplevelProtocol;
class ActorLifecycleProxy;

class IProtocol : public HasResultCodes {
 public:
  enum ActorDestroyReason {
    FailedConstructor,
    Deletion,
    AncestorDeletion,
    NormalShutdown,
    AbnormalShutdown
  };

  typedef base::ProcessId ProcessId;
  typedef IPC::Message Message;
  typedef IPC::MessageInfo MessageInfo;

  IProtocol(ProtocolId aProtoId, Side aSide)
      : mId(0),
        mProtocolId(aProtoId),
        mSide(aSide),
        mLinkStatus(LinkStatus::Inactive),
        mLifecycleProxy(nullptr),
        mManager(nullptr),
        mToplevel(nullptr) {}

  IToplevelProtocol* ToplevelProtocol() { return mToplevel; }

  // The following methods either directly forward to the toplevel protocol, or
  // almost directly do.
  int32_t Register(IProtocol* aRouted);
  int32_t RegisterID(IProtocol* aRouted, int32_t aId);
  IProtocol* Lookup(int32_t aId);
  void Unregister(int32_t aId);

  Shmem::SharedMemory* CreateSharedMemory(size_t aSize,
                                          SharedMemory::SharedMemoryType aType,
                                          bool aUnsafe, int32_t* aId);
  Shmem::SharedMemory* LookupSharedMemory(int32_t aId);
  bool IsTrackingSharedMemory(Shmem::SharedMemory* aSegment);
  bool DestroySharedMemory(Shmem& aShmem);

  MessageChannel* GetIPCChannel();
  const MessageChannel* GetIPCChannel() const;

  // Sets an event target to which all messages for aActor will be
  // dispatched. This method must be called before right before the SendPFoo
  // message for aActor is sent. And SendPFoo *must* be called if
  // SetEventTargetForActor is called. The receiver when calling
  // SetEventTargetForActor must be the actor that will be the manager for
  // aActor.
  void SetEventTargetForActor(IProtocol* aActor,
                              nsISerialEventTarget* aEventTarget);

  // Replace the event target for the messages of aActor. There must not be
  // any messages of aActor in the task queue, or we might run into some
  // unexpected behavior.
  void ReplaceEventTargetForActor(IProtocol* aActor,
                                  nsISerialEventTarget* aEventTarget);

  nsISerialEventTarget* GetActorEventTarget();
  already_AddRefed<nsISerialEventTarget> GetActorEventTarget(IProtocol* aActor);

  ProcessId OtherPid() const;

  // Actor lifecycle and other properties.
  ProtocolId GetProtocolId() const { return mProtocolId; }
  const char* GetProtocolName() const { return ProtocolIdToName(mProtocolId); }

  int32_t Id() const { return mId; }
  IProtocol* Manager() const { return mManager; }

  ActorLifecycleProxy* GetLifecycleProxy() { return mLifecycleProxy; }

  Side GetSide() const { return mSide; }
  bool CanSend() const { return mLinkStatus == LinkStatus::Connected; }
  bool CanRecv() const {
    return mLinkStatus == LinkStatus::Connected ||
           mLinkStatus == LinkStatus::Doomed;
  }

  // Remove or deallocate a managee given its type.
  virtual void RemoveManagee(int32_t, IProtocol*) = 0;
  virtual void DeallocManagee(int32_t, IProtocol*) = 0;

  Maybe<IProtocol*> ReadActor(const IPC::Message* aMessage,
                              PickleIterator* aIter, bool aNullable,
                              const char* aActorDescription,
                              int32_t aProtocolTypeId);

  virtual Result OnMessageReceived(const Message& aMessage) = 0;
  virtual Result OnMessageReceived(const Message& aMessage,
                                   Message*& aReply) = 0;
  virtual Result OnCallReceived(const Message& aMessage, Message*& aReply) = 0;
  bool AllocShmem(size_t aSize, Shmem::SharedMemory::SharedMemoryType aType,
                  Shmem* aOutMem);
  bool AllocUnsafeShmem(size_t aSize,
                        Shmem::SharedMemory::SharedMemoryType aType,
                        Shmem* aOutMem);
  bool DeallocShmem(Shmem& aMem);

  void FatalError(const char* const aErrorMsg) const;
  virtual void HandleFatalError(const char* aErrorMsg) const;

 protected:
  virtual ~IProtocol();

  friend class IToplevelProtocol;
  friend class ActorLifecycleProxy;

  void SetId(int32_t aId);

  // We have separate functions because the accessibility code manually
  // calls SetManager.
  void SetManager(IProtocol* aManager);

  // Sets the manager for the protocol and registers the protocol with
  // its manager, setting up channels for the protocol as well.  Not
  // for use outside of IPDL.
  void SetManagerAndRegister(IProtocol* aManager);
  void SetManagerAndRegister(IProtocol* aManager, int32_t aId);

  // Helpers for calling `Send` on our underlying IPC channel.
  bool ChannelSend(IPC::Message* aMsg);
  bool ChannelSend(IPC::Message* aMsg, IPC::Message* aReply);
  bool ChannelCall(IPC::Message* aMsg, IPC::Message* aReply);
  template <typename Value>
  void ChannelSend(IPC::Message* aMsg, ResolveCallback<Value>&& aResolve,
                   RejectCallback&& aReject) {
    UniquePtr<IPC::Message> msg(aMsg);
    if (CanSend()) {
      GetIPCChannel()->Send(std::move(msg), this, std::move(aResolve),
                            std::move(aReject));
    } else {
      NS_WARNING("IPC message discarded: actor cannot send");
      aReject(ResponseRejectReason::SendError);
    }
  }

  // Collect all actors managed by this object in an array. To make this safer
  // to iterate, `ActorLifecycleProxy` references are returned rather than raw
  // actor pointers.
  virtual void AllManagedActors(
      nsTArray<RefPtr<ActorLifecycleProxy>>& aActors) const = 0;

  // Internal method called when the actor becomes connected.
  void ActorConnected();

  // Called immediately before setting the actor state to doomed, and triggering
  // async actor destruction. Messages may be sent from this callback, but no
  // later.
  // FIXME(nika): This is currently unused!
  virtual void ActorDoom() {}
  void DoomSubtree();

  // Called when the actor has been destroyed due to an error, a __delete__
  // message, or a __doom__ reply.
  virtual void ActorDestroy(ActorDestroyReason aWhy) {}
  void DestroySubtree(ActorDestroyReason aWhy);

  // Called when IPC has acquired its first reference to the actor. This method
  // may take references which will later be freed by `ActorDealloc`.
  virtual void ActorAlloc() {}

  // Called when IPC has released its final reference to the actor. It will call
  // the dealloc method, causing the actor to be actually freed.
  //
  // The actor has been freed after this method returns.
  virtual void ActorDealloc() {
    if (Manager()) {
      Manager()->DeallocManagee(mProtocolId, this);
    }
  }

  static const int32_t kNullActorId = 0;
  static const int32_t kFreedActorId = 1;

 private:
  int32_t mId;
  ProtocolId mProtocolId;
  Side mSide;
  LinkStatus mLinkStatus;
  ActorLifecycleProxy* mLifecycleProxy;
  IProtocol* mManager;
  IToplevelProtocol* mToplevel;
};

#define IPC_OK() mozilla::ipc::IPCResult::Ok()
#define IPC_FAIL(actor, why) \
  mozilla::ipc::IPCResult::Fail(WrapNotNull(actor), __func__, (why))
#define IPC_FAIL_NO_REASON(actor) \
  mozilla::ipc::IPCResult::Fail(WrapNotNull(actor), __func__)

/**
 * All message deserializer and message handler should return this
 * type via above macros. We use a less generic name here to avoid
 * conflict with mozilla::Result because we have quite a few using
 * namespace mozilla::ipc; in the code base.
 */
class IPCResult {
 public:
  static IPCResult Ok() { return IPCResult(true); }
  static IPCResult Fail(NotNull<IProtocol*> aActor, const char* aWhere,
                        const char* aWhy = "");
  MOZ_IMPLICIT operator bool() const { return mSuccess; }

 private:
  explicit IPCResult(bool aResult) : mSuccess(aResult) {}
  bool mSuccess;
};

template <class PFooSide>
class Endpoint;

/**
 * All top-level protocols should inherit this class.
 *
 * IToplevelProtocol tracks all top-level protocol actors created from
 * this protocol actor.
 */
class IToplevelProtocol : public IProtocol {
#ifdef FUZZING
  friend class mozilla::ipc::ProtocolFuzzerHelper;
#endif

  template <class PFooSide>
  friend class Endpoint;

 protected:
  explicit IToplevelProtocol(const char* aName, ProtocolId aProtoId,
                             Side aSide);
  ~IToplevelProtocol() = default;

 public:
  // Shadow methods on IProtocol which are implemented directly on toplevel
  // actors.
  int32_t Register(IProtocol* aRouted);
  int32_t RegisterID(IProtocol* aRouted, int32_t aId);
  IProtocol* Lookup(int32_t aId);
  void Unregister(int32_t aId);

  Shmem::SharedMemory* CreateSharedMemory(size_t aSize,
                                          SharedMemory::SharedMemoryType aType,
                                          bool aUnsafe, int32_t* aId);
  Shmem::SharedMemory* LookupSharedMemory(int32_t aId);
  bool IsTrackingSharedMemory(Shmem::SharedMemory* aSegment);
  bool DestroySharedMemory(Shmem& aShmem);

  MessageChannel* GetIPCChannel() { return &mChannel; }
  const MessageChannel* GetIPCChannel() const { return &mChannel; }

  // NOTE: The target actor's Manager must already be set.
  void SetEventTargetForActorInternal(IProtocol* aActor,
                                      nsISerialEventTarget* aEventTarget);
  void ReplaceEventTargetForActor(IProtocol* aActor,
                                  nsISerialEventTarget* aEventTarget);
  nsISerialEventTarget* GetActorEventTarget();
  already_AddRefed<nsISerialEventTarget> GetActorEventTarget(IProtocol* aActor);

  ProcessId OtherPid() const;
  void SetOtherProcessId(base::ProcessId aOtherPid);

  virtual void OnChannelClose() = 0;
  virtual void OnChannelError() = 0;
  virtual void ProcessingError(Result aError, const char* aMsgName) {}
  virtual void OnChannelConnected(int32_t peer_pid) {}

  bool Open(UniquePtr<Transport> aTransport, base::ProcessId aOtherPid,
            MessageLoop* aThread = nullptr,
            mozilla::ipc::Side aSide = mozilla::ipc::UnknownSide);

  bool Open(MessageChannel* aChannel, nsISerialEventTarget* aEventTarget,
            mozilla::ipc::Side aSide = mozilla::ipc::UnknownSide);

  // Open a toplevel actor such that both ends of the actor's channel are on
  // the same thread. This method should be called on the thread to perform
  // the link.
  //
  // WARNING: Attempting to send a sync or intr message on the same thread
  // will crash.
  bool OpenOnSameThread(MessageChannel* aChannel,
                        mozilla::ipc::Side aSide = mozilla::ipc::UnknownSide);

  /**
   * This sends a special message that is processed on the IO thread, so that
   * other actors can know that the process will soon shutdown.
   */
  void NotifyImpendingShutdown();

  void Close();

  void SetReplyTimeoutMs(int32_t aTimeoutMs);

  void DeallocShmems();
  bool ShmemCreated(const Message& aMsg);
  bool ShmemDestroyed(const Message& aMsg);

  virtual bool ShouldContinueFromReplyTimeout() { return false; }

  // WARNING: This function is called with the MessageChannel monitor held.
  virtual void IntentionalCrash() { MOZ_CRASH("Intentional IPDL crash"); }

  // The code here is only useful for fuzzing. It should not be used for any
  // other purpose.
#ifdef DEBUG
  // Returns true if we should simulate a timeout.
  // WARNING: This is a testing-only function that is called with the
  // MessageChannel monitor held. Don't do anything fancy here or we could
  // deadlock.
  virtual bool ArtificialTimeout() { return false; }

  // Returns true if we want to cause the worker thread to sleep with the
  // monitor unlocked.
  virtual bool NeedArtificialSleep() { return false; }

  // This function should be implemented to sleep for some amount of time on
  // the worker thread. Will only be called if NeedArtificialSleep() returns
  // true.
  virtual void ArtificialSleep() {}
#else
  bool ArtificialTimeout() { return false; }
  bool NeedArtificialSleep() { return false; }
  void ArtificialSleep() {}
#endif

  virtual void EnteredCxxStack() {}
  virtual void ExitedCxxStack() {}
  virtual void EnteredCall() {}
  virtual void ExitedCall() {}

  bool IsOnCxxStack() const;

  virtual RacyInterruptPolicy MediateInterruptRace(const MessageInfo& parent,
                                                   const MessageInfo& child) {
    return RIPChildWins;
  }

  /**
   * Return true if windows messages can be handled while waiting for a reply
   * to a sync IPDL message.
   */
  virtual bool HandleWindowsMessages(const Message& aMsg) const { return true; }

  virtual void OnEnteredSyncSend() {}
  virtual void OnExitedSyncSend() {}

  virtual void ProcessRemoteNativeEventsInInterruptCall() {}

  virtual void OnChannelReceivedMessage(const Message& aMsg) {}

  void OnIPCChannelOpened() { ActorConnected(); }

  already_AddRefed<nsISerialEventTarget> GetMessageEventTarget(
      const Message& aMsg);

 private:
  base::ProcessId OtherPidMaybeInvalid() const { return mOtherPid; }

  int32_t NextId();

  template <class T>
  using IDMap = nsDataHashtable<nsUint32HashKey, T>;

  base::ProcessId mOtherPid;

  // NOTE NOTE NOTE
  // Used to be on mState
  int32_t mLastLocalId;
  IDMap<IProtocol*> mActorMap;
  IDMap<Shmem::SharedMemory*> mShmemMap;

  // XXX: We no longer need mEventTargetMap for Quantum DOM, so it may be
  // worthwhile to remove it before people start depending on it for other weird
  // things.
  Mutex mEventTargetMutex;
  IDMap<nsCOMPtr<nsISerialEventTarget>> mEventTargetMap;

  MessageChannel mChannel;
};

class IShmemAllocator {
 public:
  virtual bool AllocShmem(size_t aSize,
                          mozilla::ipc::SharedMemory::SharedMemoryType aShmType,
                          mozilla::ipc::Shmem* aShmem) = 0;
  virtual bool AllocUnsafeShmem(
      size_t aSize, mozilla::ipc::SharedMemory::SharedMemoryType aShmType,
      mozilla::ipc::Shmem* aShmem) = 0;
  virtual bool DeallocShmem(mozilla::ipc::Shmem& aShmem) = 0;
};

#define FORWARD_SHMEM_ALLOCATOR_TO(aImplClass)                             \
  virtual bool AllocShmem(                                                 \
      size_t aSize, mozilla::ipc::SharedMemory::SharedMemoryType aShmType, \
      mozilla::ipc::Shmem* aShmem) override {                              \
    return aImplClass::AllocShmem(aSize, aShmType, aShmem);                \
  }                                                                        \
  virtual bool AllocUnsafeShmem(                                           \
      size_t aSize, mozilla::ipc::SharedMemory::SharedMemoryType aShmType, \
      mozilla::ipc::Shmem* aShmem) override {                              \
    return aImplClass::AllocUnsafeShmem(aSize, aShmType, aShmem);          \
  }                                                                        \
  virtual bool DeallocShmem(mozilla::ipc::Shmem& aShmem) override {        \
    return aImplClass::DeallocShmem(aShmem);                               \
  }

inline bool LoggingEnabled() {
#if defined(DEBUG) || defined(FUZZING)
  return !!PR_GetEnv("MOZ_IPC_MESSAGE_LOG");
#else
  return false;
#endif
}

#if defined(DEBUG) || defined(FUZZING)
bool LoggingEnabledFor(const char* aTopLevelProtocol, const char* aFilter);
#endif

inline bool LoggingEnabledFor(const char* aTopLevelProtocol) {
#if defined(DEBUG) || defined(FUZZING)
  return LoggingEnabledFor(aTopLevelProtocol, PR_GetEnv("MOZ_IPC_MESSAGE_LOG"));
#else
  return false;
#endif
}

MOZ_NEVER_INLINE void LogMessageForProtocol(const char* aTopLevelProtocol,
                                            base::ProcessId aOtherPid,
                                            const char* aContextDescription,
                                            uint32_t aMessageId,
                                            MessageDirection aDirection);

MOZ_NEVER_INLINE void ProtocolErrorBreakpoint(const char* aMsg);

// The code generator calls this function for errors which come from the
// methods of protocols.  Doing this saves codesize by making the error
// cases significantly smaller.
MOZ_NEVER_INLINE void FatalError(const char* aMsg, bool aIsParent);

// The code generator calls this function for errors which are not
// protocol-specific: errors in generated struct methods or errors in
// transition functions, for instance.  Doing this saves codesize by
// by making the error cases significantly smaller.
MOZ_NEVER_INLINE void LogicError(const char* aMsg);

MOZ_NEVER_INLINE void ActorIdReadError(const char* aActorDescription);

MOZ_NEVER_INLINE void BadActorIdError(const char* aActorDescription);

MOZ_NEVER_INLINE void ActorLookupError(const char* aActorDescription);

MOZ_NEVER_INLINE void MismatchedActorTypeError(const char* aActorDescription);

MOZ_NEVER_INLINE void UnionTypeReadError(const char* aUnionName);

MOZ_NEVER_INLINE void ArrayLengthReadError(const char* aElementName);

MOZ_NEVER_INLINE void SentinelReadError(const char* aElementName);

struct PrivateIPDLInterface {};

#if defined(XP_WIN)
// This is a restricted version of Windows' DuplicateHandle() function
// that works inside the sandbox and can send handles but not retrieve
// them.  Unlike DuplicateHandle(), it takes a process ID rather than
// a process handle.  It returns true on success, false otherwise.
bool DuplicateHandle(HANDLE aSourceHandle, DWORD aTargetProcessId,
                     HANDLE* aTargetHandle, DWORD aDesiredAccess,
                     DWORD aOptions);
#endif

/**
 * Annotate the crash reporter with the error code from the most recent system
 * call. Returns the system error.
 */
void AnnotateSystemError();

/**
 * An endpoint represents one end of a partially initialized IPDL channel. To
 * set up a new top-level protocol:
 *
 * Endpoint<PFooParent> parentEp;
 * Endpoint<PFooChild> childEp;
 * nsresult rv;
 * rv = PFoo::CreateEndpoints(parentPid, childPid, &parentEp, &childEp);
 *
 * You're required to pass in parentPid and childPid, which are the pids of the
 * processes in which the parent and child endpoints will be used.
 *
 * Endpoints can be passed in IPDL messages or sent to other threads using
 * PostTask. Once an Endpoint has arrived at its destination process and thread,
 * you need to create the top-level actor and bind it to the endpoint:
 *
 * FooParent* parent = new FooParent();
 * bool rv1 = parentEp.Bind(parent, processActor);
 * bool rv2 = parent->SendBar(...);
 *
 * (See Bind below for an explanation of processActor.) Once the actor is bound
 * to the endpoint, it can send and receive messages.
 */
template <class PFooSide>
class Endpoint {
 public:
  typedef base::ProcessId ProcessId;

  Endpoint()
      : mValid(false),
        mMode(static_cast<mozilla::ipc::Transport::Mode>(0)),
        mMyPid(0),
        mOtherPid(0) {}

  Endpoint(const PrivateIPDLInterface&, mozilla::ipc::Transport::Mode aMode,
           TransportDescriptor aTransport, ProcessId aMyPid,
           ProcessId aOtherPid)
      : mValid(true),
        mMode(aMode),
        mTransport(aTransport),
        mMyPid(aMyPid),
        mOtherPid(aOtherPid) {}

  Endpoint(Endpoint&& aOther)
      : mValid(aOther.mValid),
        mTransport(aOther.mTransport),
        mMyPid(aOther.mMyPid),
        mOtherPid(aOther.mOtherPid) {
    if (aOther.mValid) {
      mMode = aOther.mMode;
    }
    aOther.mValid = false;
  }

  Endpoint& operator=(Endpoint&& aOther) {
    mValid = aOther.mValid;
    if (aOther.mValid) {
      mMode = aOther.mMode;
    }
    mTransport = aOther.mTransport;
    mMyPid = aOther.mMyPid;
    mOtherPid = aOther.mOtherPid;

    aOther.mValid = false;
    return *this;
  }

  ~Endpoint() {
    if (mValid) {
      CloseDescriptor(mTransport);
    }
  }

  ProcessId OtherPid() const { return mOtherPid; }

  // This method binds aActor to this endpoint. After this call, the actor can
  // be used to send and receive messages. The endpoint becomes invalid.
  bool Bind(PFooSide* aActor) {
    MOZ_RELEASE_ASSERT(mValid);
    MOZ_RELEASE_ASSERT(mMyPid == base::GetCurrentProcId());

    UniquePtr<Transport> transport =
        mozilla::ipc::OpenDescriptor(mTransport, mMode);
    if (!transport) {
      return false;
    }
    if (!aActor->Open(
            std::move(transport), mOtherPid, XRE_GetIOMessageLoop(),
            mMode == Transport::MODE_SERVER ? ParentSide : ChildSide)) {
      return false;
    }
    mValid = false;
    return true;
  }

  bool IsValid() const { return mValid; }

 private:
  friend struct IPC::ParamTraits<Endpoint<PFooSide>>;

  Endpoint(const Endpoint&) = delete;
  Endpoint& operator=(const Endpoint&) = delete;

  bool mValid;
  mozilla::ipc::Transport::Mode mMode;
  TransportDescriptor mTransport;
  ProcessId mMyPid, mOtherPid;
};

#if defined(XP_MACOSX)
void AnnotateCrashReportWithErrno(CrashReporter::Annotation tag, int error);
#else
static inline void AnnotateCrashReportWithErrno(CrashReporter::Annotation tag,
                                                int error) {}
#endif

// This function is used internally to create a pair of Endpoints. See the
// comment above Endpoint for a description of how it might be used.
template <class PFooParent, class PFooChild>
nsresult CreateEndpoints(const PrivateIPDLInterface& aPrivate,
                         base::ProcessId aParentDestPid,
                         base::ProcessId aChildDestPid,
                         Endpoint<PFooParent>* aParentEndpoint,
                         Endpoint<PFooChild>* aChildEndpoint) {
  MOZ_RELEASE_ASSERT(aParentDestPid);
  MOZ_RELEASE_ASSERT(aChildDestPid);

  TransportDescriptor parentTransport, childTransport;
  nsresult rv;
  if (NS_FAILED(rv = CreateTransport(aParentDestPid, &parentTransport,
                                     &childTransport))) {
    AnnotateCrashReportWithErrno(
        CrashReporter::Annotation::IpcCreateEndpointsNsresult, int(rv));
    return rv;
  }

  *aParentEndpoint =
      Endpoint<PFooParent>(aPrivate, mozilla::ipc::Transport::MODE_SERVER,
                           parentTransport, aParentDestPid, aChildDestPid);

  *aChildEndpoint =
      Endpoint<PFooChild>(aPrivate, mozilla::ipc::Transport::MODE_CLIENT,
                          childTransport, aChildDestPid, aParentDestPid);

  return NS_OK;
}

/**
 * A managed endpoint represents one end of a partially initialized managed
 * IPDL actor. It is used for situations where the usual IPDL Constructor
 * methods do not give sufficient control over the construction of actors, such
 * as when constructing actors within replies, or constructing multiple related
 * actors simultaneously.
 *
 * FooParent* parent = new FooParent();
 * ManagedEndpoint<PFooChild> childEp = parentMgr->OpenPFooEndpoint(parent);
 *
 * ManagedEndpoints should be sent using IPDL messages or other mechanisms to
 * the other side of the manager channel. Once the ManagedEndpoint has arrived
 * at its destination, you can create the actor, and bind it to the endpoint.
 *
 * FooChild* child = new FooChild();
 * childMgr->BindPFooEndpoint(childEp, child);
 *
 * WARNING: If the remote side of an endpoint has not been bound before it
 * begins to receive messages, an IPC routing error will occur, likely causing
 * a browser crash.
 */
template <class PFooSide>
class ManagedEndpoint {
 public:
  ManagedEndpoint() : mId(0) {}

  ManagedEndpoint(const PrivateIPDLInterface&, int32_t aId) : mId(aId) {}

  ManagedEndpoint(ManagedEndpoint&& aOther) : mId(aOther.mId) {
    aOther.mId = 0;
  }

  ManagedEndpoint& operator=(ManagedEndpoint&& aOther) {
    mId = aOther.mId;
    aOther.mId = 0;
    return *this;
  }

  bool IsValid() const { return mId != 0; }

  Maybe<int32_t> ActorId() const { return IsValid() ? Some(mId) : Nothing(); }

  bool operator==(const ManagedEndpoint& _o) const { return mId == _o.mId; }

 private:
  friend struct IPC::ParamTraits<ManagedEndpoint<PFooSide>>;

  ManagedEndpoint(const ManagedEndpoint&) = delete;
  ManagedEndpoint& operator=(const ManagedEndpoint&) = delete;

  // The routing ID for the to-be-created endpoint.
  int32_t mId;

  // XXX(nika): Might be nice to have other info for assertions?
  // e.g. mManagerId, mManagerType, etc.
};

// The ActorLifecycleProxy is a helper type used internally by IPC to maintain a
// maybe-owning reference to an IProtocol object. For well-behaved actors
// which are not freed until after their `Dealloc` method is called, a
// reference to an actor's `ActorLifecycleProxy` object is an owning one, as the
// `Dealloc` method will only be called when all references to the
// `ActorLifecycleProxy` are released.
//
// Unfortunately, some actors may be destroyed before their `Dealloc` method
// is called. For these actors, `ActorLifecycleProxy` acts as a weak pointer,
// and will begin to return `nullptr` from its `Get()` method once the
// corresponding actor object has been destroyed.
//
// When calling a `Recv` method, IPC will hold a `ActorLifecycleProxy` reference
// to the target actor, meaning that well-behaved actors can behave as though a
// strong reference is being held.
//
// Generic IPC code MUST treat ActorLifecycleProxy references as weak
// references!
class ActorLifecycleProxy {
 public:
  NS_INLINE_DECL_REFCOUNTING_ONEVENTTARGET(ActorLifecycleProxy)

  IProtocol* Get() { return mActor; }

 private:
  friend class IProtocol;

  explicit ActorLifecycleProxy(IProtocol* aActor);
  ~ActorLifecycleProxy();

  ActorLifecycleProxy(const ActorLifecycleProxy&) = delete;
  ActorLifecycleProxy& operator=(const ActorLifecycleProxy&) = delete;

  IProtocol* MOZ_NON_OWNING_REF mActor;

  // Hold a reference to the actor's manager's ActorLifecycleProxy to help
  // prevent it from dying while we're still alive!
  RefPtr<ActorLifecycleProxy> mManager;
};

void TableToArray(const nsTHashtable<nsPtrHashKey<void>>& aTable,
                  nsTArray<void*>& aArray);

}  // namespace ipc

template <typename Protocol>
class ManagedContainer : public nsTHashtable<nsPtrHashKey<Protocol>> {
  typedef nsTHashtable<nsPtrHashKey<Protocol>> BaseClass;

 public:
  // Having the core logic work on void pointers, rather than typed pointers,
  // means that we can have one instance of this code out-of-line, rather
  // than several hundred instances of this code out-of-lined.  (Those
  // repeated instances don't necessarily get folded together by the linker
  // because they contain member offsets and such that differ between the
  // functions.)  We do have to pay for it with some eye-bleedingly bad casts,
  // though.
  void ToArray(nsTArray<Protocol*>& aArray) const {
    ::mozilla::ipc::TableToArray(
        *reinterpret_cast<const nsTHashtable<nsPtrHashKey<void>>*>(
            static_cast<const BaseClass*>(this)),
        reinterpret_cast<nsTArray<void*>&>(aArray));
  }
};

template <typename Protocol>
Protocol* LoneManagedOrNullAsserts(
    const ManagedContainer<Protocol>& aManagees) {
  if (aManagees.IsEmpty()) {
    return nullptr;
  }
  MOZ_ASSERT(aManagees.Count() == 1);
  return aManagees.ConstIter().Get()->GetKey();
}

template <typename Protocol>
Protocol* SingleManagedOrNull(const ManagedContainer<Protocol>& aManagees) {
  if (aManagees.Count() != 1) {
    return nullptr;
  }
  return aManagees.ConstIter().Get()->GetKey();
}

}  // namespace mozilla

namespace IPC {

template <>
struct ParamTraits<mozilla::ipc::ActorHandle> {
  typedef mozilla::ipc::ActorHandle paramType;

  static void Write(Message* aMsg, const paramType& aParam) {
    IPC::WriteParam(aMsg, aParam.mId);
  }

  static bool Read(const Message* aMsg, PickleIterator* aIter,
                   paramType* aResult) {
    int id;
    if (IPC::ReadParam(aMsg, aIter, &id)) {
      aResult->mId = id;
      return true;
    }
    return false;
  }

  static void Log(const paramType& aParam, std::wstring* aLog) {
    aLog->append(StringPrintf(L"(%d)", aParam.mId));
  }
};

template <class PFooSide>
struct ParamTraits<mozilla::ipc::Endpoint<PFooSide>> {
  typedef mozilla::ipc::Endpoint<PFooSide> paramType;

  static void Write(Message* aMsg, const paramType& aParam) {
    IPC::WriteParam(aMsg, aParam.mValid);
    if (!aParam.mValid) {
      return;
    }

    IPC::WriteParam(aMsg, static_cast<uint32_t>(aParam.mMode));

    // We duplicate the descriptor so that our own file descriptor remains
    // valid after the write. An alternative would be to set
    // aParam.mTransport.mValid to false, but that won't work because aParam
    // is const.
    mozilla::ipc::TransportDescriptor desc =
        mozilla::ipc::DuplicateDescriptor(aParam.mTransport);
    IPC::WriteParam(aMsg, desc);

    IPC::WriteParam(aMsg, aParam.mMyPid);
    IPC::WriteParam(aMsg, aParam.mOtherPid);
  }

  static bool Read(const Message* aMsg, PickleIterator* aIter,
                   paramType* aResult) {
    MOZ_RELEASE_ASSERT(!aResult->mValid);

    if (!IPC::ReadParam(aMsg, aIter, &aResult->mValid)) {
      return false;
    }
    if (!aResult->mValid) {
      // Object is empty, but read succeeded.
      return true;
    }

    uint32_t mode;
    if (!IPC::ReadParam(aMsg, aIter, &mode) ||
        !IPC::ReadParam(aMsg, aIter, &aResult->mTransport) ||
        !IPC::ReadParam(aMsg, aIter, &aResult->mMyPid) ||
        !IPC::ReadParam(aMsg, aIter, &aResult->mOtherPid)) {
      return false;
    }
    aResult->mMode = Channel::Mode(mode);
    return true;
  }

  static void Log(const paramType& aParam, std::wstring* aLog) {
    aLog->append(StringPrintf(L"Endpoint"));
  }
};

template <class PFooSide>
struct ParamTraits<mozilla::ipc::ManagedEndpoint<PFooSide>> {
  typedef mozilla::ipc::ManagedEndpoint<PFooSide> paramType;

  static void Write(Message* aMsg, const paramType& aParam) {
    IPC::WriteParam(aMsg, aParam.mId);
  }

  static bool Read(const Message* aMsg, PickleIterator* aIter,
                   paramType* aResult) {
    MOZ_RELEASE_ASSERT(aResult->mId == 0);

    if (!IPC::ReadParam(aMsg, aIter, &aResult->mId)) {
      return false;
    }
    return true;
  }

  static void Log(const paramType& aParam, std::wstring* aLog) {
    aLog->append(StringPrintf(L"ManagedEndpoint"));
  }
};

}  // namespace IPC

#endif  // mozilla_ipc_ProtocolUtils_h
