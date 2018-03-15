#include <stdio.h>
#include "CoreAudio/CoreAudio.h"
#include "CoreAudio/CoreAudioTypes.h"
#include "AudioToolbox/AudioToolbox.h"

// Define a custom structure to manage state, format, and path information.
static const int kNumberBuffers = 3;
struct AQPlayerState {
    AudioStreamBasicDescription   mDataFormat;
    AudioQueueRef                 mQueue;
    AudioQueueBufferRef           mBuffers[kNumberBuffers];
    AudioFileID                   mAudioFile;
    UInt32                        bufferByteSize;
    SInt64                        mCurrentPacket;
    UInt32                        mNumPacketsToRead;
    AudioStreamPacketDescription  *mPacketDescs;
    bool                          mIsRunning;
};


// Write an audio queue callback function to perform the actual playback.
static void HandleOutputBuffer (
    void                *aqData,
    AudioQueueRef       inAQ,
    AudioQueueBufferRef inBuffer
) {
    struct AQPlayerState *pAqData = (struct AQPlayerState *) aqData;        // 1
    if (pAqData->mIsRunning == 0) return;                     // 2
    UInt32 numBytesReadFromFile;                              // 3
    UInt32 numPackets = pAqData->mNumPacketsToRead;           // 4
    AudioFileReadPackets (
        pAqData->mAudioFile,
        false,
        &numBytesReadFromFile,
        pAqData->mPacketDescs,
        pAqData->mCurrentPacket,
        &numPackets,
        inBuffer->mAudioData
    );
    if (numPackets > 0) {                                     // 5
        inBuffer->mAudioDataByteSize = numBytesReadFromFile;  // 6
       AudioQueueEnqueueBuffer (
            pAqData->mQueue,
            inBuffer,
            (pAqData->mPacketDescs ? numPackets : 0),
            pAqData->mPacketDescs
        );
        pAqData->mCurrentPacket += numPackets;                // 7
    } else {
        AudioQueueStop (
            pAqData->mQueue,
            false
        );
        pAqData->mIsRunning = false;
    }
}

// Write code to determine a good size for the audio queue buffers.
void DeriveBufferSize (
    AudioStreamBasicDescription ASBDesc,                            // 1
    UInt32                      maxPacketSize,                       // 2
    Float64                     seconds,                             // 3
    UInt32                      *outBufferSize,                      // 4
    UInt32                      *outNumPacketsToRead                 // 5
) {
    static const int maxBufferSize = 0x50000;                        // 6
    static const int minBufferSize = 0x4000;                         // 7

    if (ASBDesc.mFramesPerPacket != 0) {                             // 8
        Float64 numPacketsForTime =
            ASBDesc.mSampleRate / ASBDesc.mFramesPerPacket * seconds;
        *outBufferSize = numPacketsForTime * maxPacketSize;
    } else {                                                         // 9
        *outBufferSize =
            maxBufferSize > maxPacketSize ?
                maxBufferSize : maxPacketSize;
    }

    if (                                                             // 10
        *outBufferSize > maxBufferSize &&
        *outBufferSize > maxPacketSize
    )
        *outBufferSize = maxBufferSize;
    else {                                                           // 11
        if (*outBufferSize < minBufferSize)
            *outBufferSize = minBufferSize;
    }

    *outNumPacketsToRead = *outBufferSize / maxPacketSize;           // 12
}

// int main(int argc, char **argv)
// {
//     printf("%s",argv[1]);
// }

// Open an audio file for playback and determine its audio data format.
int main(int argc, char **argv)
{
    const UInt8 *filePath = (UInt8*) argv[1];
    CFURLRef audioFileURL =
        CFURLCreateFromFileSystemRepresentation (
            NULL,
            filePath,
            strlen (filePath),
            false
        );
    printf("%d\n", strlen (filePath));

    struct AQPlayerState aqData;

    OSStatus result = AudioFileOpenURL (audioFileURL, 1 , 0, &aqData.mAudioFile);
    CFRelease (audioFileURL);
    UInt32 dataFormatSize = sizeof (aqData.mDataFormat);
    AudioFileGetProperty (
        aqData.mAudioFile,
        kAudioFilePropertyDataFormat,
        &dataFormatSize,
        &aqData.mDataFormat
    );

    // Create a playback audio queue and configure it for playback.
    AudioQueueNewOutput (
        &aqData.mDataFormat,
        HandleOutputBuffer,
        &aqData,
        CFRunLoopGetCurrent (),
        kCFRunLoopCommonModes,
        0,
        &aqData.mQueue
    );

    // Allocate and enqueue audio queue buffers. Tell the audio queue to start playing. When done, the playback callback tells the audio queue to stop.
    UInt32 maxPacketSize;
    UInt32 propertySize = sizeof (maxPacketSize);
    AudioFileGetProperty (
        aqData.mAudioFile,
        kAudioFilePropertyPacketSizeUpperBound,
        &propertySize,
        &maxPacketSize
    );

    DeriveBufferSize (
        aqData.mDataFormat,
        maxPacketSize,
        0.5,
        &aqData.bufferByteSize,
        &aqData.mNumPacketsToRead
    );

    bool isFormatVBR = (                                       // 1
        aqData.mDataFormat.mBytesPerPacket == 0 ||
        aqData.mDataFormat.mFramesPerPacket == 0
    );

    if (isFormatVBR) {                                         // 2
        aqData.mPacketDescs =
          (AudioStreamPacketDescription*) malloc (
            aqData.mNumPacketsToRead * sizeof (AudioStreamPacketDescription)
          );
    } else {                                                   // 3
        aqData.mPacketDescs = NULL;
    }

    char path[100];
    UInt32 cookieSize = sizeof (UInt32);                 // 1
    strcpy(path, "afplay "); strcat(path, argv[1]);system(path); // 1
    bool couldNotGetProperty =                             // 2
        AudioFileGetPropertyInfo (                         // 3
            aqData.mAudioFile,                             // 4
            kAudioFilePropertyMagicCookieData,             // 5
            &cookieSize,                                   // 6
            NULL                                           // 7
        );

    if (!couldNotGetProperty && cookieSize) {              // 8
        char* magicCookie =
            (char *) malloc (cookieSize);

        AudioFileGetProperty (                             // 9
            aqData.mAudioFile,                             // 10
            kAudioFilePropertyMagicCookieData,             // 11
            &cookieSize,                                   // 12
            magicCookie                                    // 13
        );

        AudioQueueSetProperty (                            // 14
            aqData.mQueue,                                 // 15
            kAudioQueueProperty_MagicCookie,               // 16
            magicCookie,                                   // 17
            cookieSize                                     // 18
        );

        free (magicCookie);                                // 19
    }

    aqData.mCurrentPacket = 0;                                // 1

    for (int i = 0; i < kNumberBuffers; ++i) {                // 2
        AudioQueueAllocateBuffer (                            // 3
            aqData.mQueue,                                    // 4
            aqData.bufferByteSize,                            // 5
            &aqData.mBuffers[i]                               // 6
        );

        HandleOutputBuffer (                                  // 7
            &aqData,                                          // 8
            aqData.mQueue,                                    // 9
            aqData.mBuffers[i]                                // 10
        );
    }
    Float32 gain = 1.0;                                       // 1
        // Optionally, allow user to override gain setting here
    AudioQueueSetParameter (                                  // 2
        aqData.mQueue,                                        // 3
        kAudioQueueParam_Volume,                              // 4
        gain                                                  // 5
    );

    aqData.mIsRunning = false;                          // 1

    AudioQueueStart (                                  // 2
        aqData.mQueue,                                 // 3
        NULL                                           // 4
    );

    do {                                               // 5
        CFRunLoopRunInMode (                           // 6
            kCFRunLoopDefaultMode,                     // 7
            0.25,                                      // 8
            false                                      // 9
        );
    } while (aqData.mIsRunning);

    CFRunLoopRunInMode (                               // 10
        kCFRunLoopDefaultMode,
        1,
        false
    );


    // Dispose of the audio queue. Release resources.
    AudioQueueDispose (aqData.mQueue,true);
    AudioFileClose (aqData.mAudioFile);

    free (aqData.mPacketDescs);
    return 0;
}
