 cmake_minimum_required(VERSION 3.11)

find_library(coreAudio CoreAudio)
find_library(audioUnit AudioUnit)
find_library(audioToolbox AudioToolbox)
find_library(coreFoundation CoreFoundation)

if (NOT coreAudio)
    message(FATAL_ERROR "coreAudio not found")
endif()

add_executable(wav_decoder "audioPlay.c")
target_link_libraries(test ${coreAudio} ${audioUnit} ${audioToolbox} ${coreFoundation})
