const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Clone = require('../../util/clone');
const MathUtil = require('../../util/math-util');
const formatMessage = require('format-message');
const Video = require('../../io/video');
const TargetType = require('../../extension-support/target-type');
const log = require('../../util/log');
const {
    toScratchCoords,
    getPalmCenter,
    getPalmScale,
    getPinchRatio,
    getPinchPoint,
    getHandOpenness,
    angleBetween,
    nextCaptureDelay,
    smoothInferenceMs
} = require('./utils');
const {DIMENSIONS, isSoftwareRenderer} = require('./hand-landmarker');
const {createMainThreadDetector, createWorkerDetector} = require('./hand-detectors');

// eslint-disable-next-line @stylistic/max-len
const menuIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLW1pdGVybGltaXQ9IjIiIGNsaXAtcnVsZT0iZXZlbm9kZCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBmaWxsPSJub25lIiBkPSJNLjA1IDBoMzl2MzloLTM5eiIvPjxwYXRoIGZpbGw9IiM0Yzk3ZmYiIGQ9Ik0xNC4wNiAyMC42MnMuMjEtLjIzLjM0LS40NmMuNDYtLjguOTMtMi4zLjU3LTQuMjgtLjEyLS42OC0uMi0uNjYtLjYyLTIuOS0xLjA1LTUuNTUtMS4wOC01LjU1LTEuMDQtNi4xOC4wNy0xIC42NS0xLjY3IDEuMTgtMS44OGExIDEgMCAwIDEgLjQ4LS4xbC4yNS4wNC4yNS4xcS4zLjE2LjYuNThjLjMyLjQ2LjU5IDEuMDkuNjMgMS4yLjE4LjQyLjA3LjUuNDIgMS40NCAxLjM4IDMuNzUgMS4zNiA0LjM0IDEuNjggNS41N2wuMDUuMTctLjAzLS43N2MtLjA2LTEuMDYtLjIzLTIuMzYtLjE3LTMuNGwuMS0xLjIxYy4xLTEuNSAwLTMuNTUuMzMtNC40Mi4yNS0uNjcgMS4wOC0xLjI4IDEuODQtMS4xNS4zNS4wNi43LjI2Ljk4LjdxLjE2LjI1LjIyLjdjLjA1LjQ2LjAxIDEuMS4wNCAxLjU4IDAgLjE4LjA5IDIuMDEuMTQgMi4yNWwuMTMuNThjLjE1Ljc1LjE4IDEuNTIuMTggMi4yNmwuMTMtLjU4LjktMy44NmMuMjYtLjg0LjU2LTEuMzMuODMtMS42LjMtLjI5LjYtLjM5Ljg3LS40cS42LjAyIDEuMDYuNTNjLjM1LjQuNTYuOTguNTcgMS4zM3MtLjQ1IDEuNjgtLjYgNC4xMmMtLjA3IDEuMzUuMDQgMS4zNy0uMzEgMi42OC0uMDEuMDMtLjI4Ljg3LS40MyAxLjctLjA4LjQyLS4xNC44My0uMDcgMS4xbC4wMi4wNGEyIDIgMCAwIDAgMS40NS0uODRjLjMzLS40MiAxLjgtMi43MSAzLjA4LTMuNzdxLjYzLS41MyAxLjE4LS42NC41Mi0uMS45NS4xNWwuMjUuMjIuMS4xNS4wOC4xOWMuMDYuMTguMS40My0uMDIuNzhxLS4wNC4xNS0uNDIuN2MtLjc4IDEuMS0yLjYyIDMuNDQtMi44MiAzLjcxLTEuOTIgMi40NC0xLjYyIDIuNzMtMS45IDQuNTYtLjgzIDUuMjUtMS4yIDUuNTctMS42NCA2LjUxYTIgMiAwIDAgMC0uMS40NGMtLjQ1IDIuOTUtLjE2IDIuOTYuMTIgNS4wOWwuMiAyYy4wNC4zLjA2LjM1LjE2LjU4YS42LjYgMCAwIDEtLjQuODJzLTMuMy44NC00Ljg4LjljLTEuNTYuMDUtNC42My0uNTYtNC42My0uNTZhLjYuNiAwIDAgMS0uNDctLjc1Yy4xNi0uNi4xNy0xLjExLjE1LTEuNzctLjAzLTEuMDctLjE2LTIuNDgtLjA1LTVsLS4wNS0uMDZxLS4xLS4xNC0uMjEtLjM0Yy0uMDYtLjA5LS4xMS0uMi0uMjMtLjMtLjctLjYzLTIuNDQtMS44Mi0zLjU2LTIuNjdhNyA3IDAgMCAxLTEuMS0uOTZjLS4yMi0uMy0uMS0uNC0uODMtMS4wN2wtLjU5LS41M2MtLjE2LS4xNy0uMjgtLjQtLjQ1LS41Ni0uMTktLjE4LS40Mi0uMy0uNjMtLjQ1bC0uNzQtLjZjLS4xOC0uMTMtLjI4LS4xNC0uMzktLjE5YTIgMiAwIDAgMS0uNTQtLjMzcS0uMy0uMjYtLjQ1LS40NGwtLjEzLS4xM3EtLjA4LS4wMy0uMjkgMGgtLjA1YS42LjYgMCAwIDEtLjU3LS4zOWwtLjEtLjI3LS4wMi0uMDRMNSAyMC4xYTEgMSAwIDAgMSAwLS41MWMuMDgtLjQ1LjM5LTEuMTIgMS4xLTEuNS42LS4zMyAxLjU3LS40NyAzLjAyLjE0IDEuNi42NyAyIDEuNDkgMi45IDIuMTEuMDcuMDYuNDcuMzMuOTQuNTNxLjMuMTMuNi4xN2MuMTUtLjE4LjItLjI0LjUxLS40Mm0tNy44Mi0uODhjLjM0LjA0LjUzLjE4LjczLjM4LjEyLjEyLjI0LjI3LjQ2LjQ3LjE2LjEzLjI0LjE0LjM0LjE4LjE1LjA1LjMxLjEyLjU1LjNsLjc0LjZjLjI0LjE4LjUuMzIuNzIuNTMuMTkuMTguMzIuNDEuNS42cS4yNS4yNS41My40OGMuODYuOC43My45Ljk5IDEuMjUuMS4xNC40My40Ljg1LjcgMS4xNS44OCAyLjkzIDIuMSAzLjY0IDIuNzQuMzIuMjguNDEuNTguNTcuNzhxLjEzLjEyLjIyLjI2YS42LjYgMCAwIDEgLjEuMzdjLS4xMiAyLjYzLjAyIDQuMDcuMDUgNS4xNS4wMi41NS4wMSAxLjAxLS4wNiAxLjQ4LjkzLjE3IDIuNy40NiAzLjc2LjQyIDEuMDgtLjA0IDMtLjQ2IDQtLjdsLS4wNC0uMjUtLjItMS45OGMtLjMtMi4yNy0uNi0yLjI4LS4xMi01LjQyLjA3LS40OC4xOC0uNy4yLS43Ni40MS0uOS43NS0xLjIgMS41NC02LjIuMzItMi4wNS0uMDEtMi4zNyAyLjE0LTUuMTIuMi0uMjYgMi4wMi0yLjU3IDIuNzktMy42NmwuMTktLjI4LS4wNi4wM3EtLjI0LjExLS40OS4zM2MtMS4yMiAxLTIuNTggMy4xOC0yLjkgMy41OWEzLjMgMy4zIDAgMCAxLTIuNjkgMS4zLjYuNiAwIDAgMCAuNDctLjk5bC0uNDcgMS0uNDgtLjI1LS4yNi0uMzMuNDYuMjItLjU2LS40YTMgMyAwIDAgMS0uMDgtMS4zNGMuMTEtMS4wMi41LTIuMjMuNTItMi4yOC4zMi0xLjE5LjItMS4yLjI4LTIuNDMuMTQtMi4zOS42LTMuNjkuNTktNC4wMyAwLS4xMi0uMDktLjMtLjItLjQ1bC0uMTQtLjE3LS4wNS0uMDQtLjExLjExcS0uMjMuMy0uNDUgMS4wMWMtLjA1LjE1LS44MiAzLjQ5LS44OSAzLjgtLjQyIDEuOC0uMzQgMi4zNS0uNzMgMy43NGwtLjA3LjU0YS42LjYgMCAwIDEtLjc0LjVxLS44My0uMTctMS0xLjQyYy0uMTItMS4xNi4yMy0zLjIyLS4xNC01LjA3bC0uMTItLjU4Yy0uMDYtLjI1LS4xNi0yLjI0LS4xNy0yLjQ0LS4wMi0uNCAwLS45Mi0uMDItMS4zMy0uMDEtLjE2IDAtLjMtLjA1LS4zNy0uMjItLjM0LS41OC0uMDEtLjY3LjIzLS4zLjgtLjE2IDIuNy0uMjUgNC4wN2wtLjEgMS4yMmMtLjA2Ljk4LjExIDIuMjMuMTcgMy4yNS4wNS44MiAwIDEuNTItLjE3IDEuOTNhMSAxIDAgMCAxLS4yMi4yNWwtLjI4LjItLjM1LjFoLS4xYTEuNCAxLjQgMCAwIDEtLjkyLS42NCAzIDMgMCAwIDEtLjM3LS44N2MtLjMtMS4yLS4yOC0xLjc5LTEuNjQtNS40NS0uMzQtLjkxLS4yMi0uOTgtLjQtMS40LS4wMy0uMDctLjItLjQ2LS40LS44MXEtLjEyLS4yMi0uMjUtLjM0bC0uMS4wNmExIDEgMCAwIDAtLjIzLjM4IDEgMSAwIDAgMC0uMDguMzljLS4wNC42LjAyLjYgMS4wMiA1Ljg4LjQyIDIuMjUuNSAyLjIzLjYzIDIuOWE3LjYgNy42IDAgMCAxLS43MSA1LjFjLS4zLjUtLjYuOC0uNzcuOS0uMjUuMTQtLjIyLjE3LS40LjM5YS42LjYgMCAwIDEtLjQxLjJjLTEuMDYuMDktMi4zOS0uNzktMi41Ny0uOTItLjM3LS4yNS0uNjYtLjU0LS45OC0uODVhNSA1IDAgMCAwLTEuNjgtMS4xM2MtMS41OS0uNjYtMi4yMy4wOC0yLjQxLjM5Ii8+PHBhdGggZmlsbD0iI2ZmYmYwMCIgZD0iTTI4LjE4IDI0LjcyYTIuNiAyLjYgMCAwIDAgMS44LTEuODFsLjU1LTJjLjI1LS45NiAxLjYtLjk2IDEuODYgMGwuNTQgMmMuMjQuODguOTMgMS41NyAxLjgxIDEuOGwyIC41NWMuOTYuMjUuOTYgMS42IDAgMS44NmwtMiAuNTRjLS44OC4yMy0xLjU3LjkzLTEuODEgMS44bC0uNTQgMi4wMmEuOTYuOTYgMCAwIDEtMS44NiAwbC0uNTQtMi4wMWEyLjYgMi42IDAgMCAwLTEuODEtMS44MWwtMi0uNTRhLjk2Ljk2IDAgMCAxIDAtMS44NnpNMy41IDcuMDljLjY2LS4xOCAxLjE4LS43IDEuMzYtMS4zNmwuNC0xLjVhLjcyLjcyIDAgMCAxIDEuNCAwbC40IDEuNWMuMTguNjYuNyAxLjE4IDEuMzYgMS4zNmwxLjUuNGMuNzIuMi43MiAxLjIgMCAxLjRsLTEuNS40Yy0uNjYuMTgtMS4xOC43LTEuMzYgMS4zNmwtLjQgMS41YS43Mi43MiAwIDAgMS0xLjQgMGwtLjQtMS41QTEuOSAxLjkgMCAwIDAgMy41IDkuMjlMMiA4Ljg5YS43Mi43MiAwIDAgMSAwLTEuNHoiLz48cGF0aCBmaWxsLW9wYWNpdHk9Ii41IiBmaWxsLXJ1bGU9Im5vbnplcm8iIGQ9Im0yOS45OCAyMC43Ny0uNTQgMmEyIDIgMCAwIDEtMS40NiAxLjQ3bC0yLjAxLjU0Yy0xLjQ0LjM4LTEuNDQgMi40MyAwIDIuODJsMi4wMS41NGMuNy4yIDEuMjcuNzUgMS40NiAxLjQ2bC41NCAyYy4zOCAxLjQ1IDIuNDMgMS40NSAyLjgyIDBsLjU0LTJjLjItLjcxLjc1LTEuMjcgMS40Ni0xLjQ2bDItLjU0YzEuNDUtLjM5IDEuNDUtMi40NCAwLTIuODJsLTItLjU0YTIgMiAwIDAgMS0xLjQ2LTEuNDZsLS41NC0yYy0uMzktMS40NS0yLjQ0LTEuNDUtMi44MiAwbTEuODYuMjUuNTMgMi4wMWEzIDMgMCAwIDAgMi4xNyAyLjE2bDIgLjU0Yy40Ni4xMy40Ni43NyAwIC45bC0yIC41NGEzIDMgMCAwIDAtMi4xNSAyLjE2bC0uNTUgMmEuNDUuNDUgMCAwIDEtLjg4IDBsLS41NS0yYTMgMyAwIDAgMC0yLjE2LTIuMTZsLTItLjU0Yy0uNDYtLjEzLS40Ni0uNzctLjAxLS45bDIuMDEtLjU0YTMgMyAwIDAgMCAyLjE2LTIuMTZsLjU0LTJhLjQ3LjQ3IDAgMCAxIC45IDAiLz48cGF0aCBmaWxsLW9wYWNpdHk9Ii40IiBmaWxsLXJ1bGU9Im5vbnplcm8iIGQ9Im00LjcxIDQuMDktLjQgMS41Yy0uMTQuNS0uNTIuODgtMS4wMSAxLjAxbC0xLjUuNDFjLTEuMjEuMzItMS4yMSAyLjAzIDAgMi4zNmwxLjUuNGMuNDkuMTMuODcuNTIgMSAxbC40MSAxLjUyYy4zMiAxLjIgMi4wMyAxLjIgMi4zNiAwbC40LTEuNTFjLjE0LS41LjUyLS44NyAxLTFsMS41Mi0uNDFjMS4yLS4zMyAxLjItMi4wNCAwLTIuMzZsLTEuNS0uNGExLjQgMS40IDAgMCAxLTEuMDItMWwtLjQtMS41MmMtLjMyLTEuMi0yLjA0LTEuMi0yLjM2IDBtMS40LjI2LjQgMS41MWEyLjQgMi40IDAgMCAwIDEuNzEgMS43bDEuNS40MmMuMjIuMDUuMjIuMzcgMCAuNDJsLTEuNS40Yy0uODMuMjQtMS40OS44OS0xLjcxIDEuNzNsLS40IDEuNWEuMjIuMjIgMCAwIDEtLjQzIDBsLS40MS0xLjVhMi40IDIuNCAwIDAgMC0xLjcxLTEuNzFsLTEuNS0uNGMtLjIyLS4wNi0uMjItLjM4IDAtLjQzbDEuNS0uNDFhMi40IDIuNCAwIDAgMCAxLjctMS43MWwuNDItMS41Yy4wNS0uMjIuMzctLjIyLjQyIDAiLz48cGF0aCBmaWxsPSIjNGM5N2ZmIiBmaWxsLW9wYWNpdHk9Ii40NCIgZmlsbC1ydWxlPSJub256ZXJvIiBkPSJNMzYuOTggMS4wM2ExLjE2IDEuMTYgMCAwIDEgMS4xNSAxLjAydjcuMDhhMS4xNiAxLjE2IDAgMCAxLTEuMTUgMS4xNiAxLjE2IDEuMTYgMCAwIDEtMS4xNi0xLjAyVjMuMzRoLTUuNzlhMS4xNiAxLjE2IDAgMCAxLTEuMTUtMS4wMXYtLjE0YTEuMTYgMS4xNiAwIDAgMSAxLjAxLTEuMTZ6TTIuMjYgMzguMDZhMS4xNiAxLjE2IDAgMCAxLTEuMTYtMS4wMXYtNy4wOWExLjE2IDEuMTYgMCAwIDEgMS4xNi0xLjE1IDEuMTYgMS4xNiAwIDAgMSAxLjE1IDEuMDF2NS45M2g1LjhhMS4xNiAxLjE2IDAgMCAxIDEuMTUgMS4wMnYuMTRhMS4xNiAxLjE2IDAgMCAxLTEuMDIgMS4xNXoiLz48L3N2Zz4=';

// eslint-disable-next-line @stylistic/max-len
const blockIconURI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLW1pdGVybGltaXQ9IjIiIGNsaXAtcnVsZT0iZXZlbm9kZCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBmaWxsPSJub25lIiBkPSJNLjA1IDBoMzl2MzloLTM5eiIvPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0xNC4wNiAyMC42MnMuMjEtLjIzLjM0LS40NmMuNDYtLjguOTMtMi4zLjU3LTQuMjgtLjEyLS42OC0uMi0uNjYtLjYyLTIuOS0xLjA1LTUuNTUtMS4wOC01LjU1LTEuMDQtNi4xOC4wNy0xIC42NS0xLjY3IDEuMTgtMS44OGExIDEgMCAwIDEgLjQ4LS4xbC4yNS4wNC4yNS4xcS4zLjE2LjYuNThjLjMyLjQ2LjU5IDEuMDkuNjMgMS4yLjE4LjQyLjA3LjUuNDIgMS40NCAxLjM4IDMuNzUgMS4zNiA0LjM0IDEuNjggNS41N2wuMDUuMTctLjAzLS43N2MtLjA2LTEuMDYtLjIzLTIuMzYtLjE3LTMuNGwuMS0xLjIxYy4xLTEuNSAwLTMuNTUuMzMtNC40Mi4yNS0uNjcgMS4wOC0xLjI4IDEuODQtMS4xNS4zNS4wNi43LjI2Ljk4LjdxLjE2LjI1LjIyLjdjLjA1LjQ2LjAxIDEuMS4wNCAxLjU4IDAgLjE4LjA5IDIuMDEuMTQgMi4yNWwuMTMuNThjLjE1Ljc1LjE4IDEuNTIuMTggMi4yNmwuMTMtLjU4LjktMy44NmMuMjYtLjg0LjU2LTEuMzMuODMtMS42LjMtLjI5LjYtLjM5Ljg3LS40cS42LjAyIDEuMDYuNTNjLjM1LjQuNTYuOTguNTcgMS4zM3MtLjQ1IDEuNjgtLjYgNC4xMmMtLjA3IDEuMzUuMDQgMS4zNy0uMzEgMi42OC0uMDEuMDMtLjI4Ljg3LS40MyAxLjctLjA4LjQyLS4xNC44My0uMDcgMS4xbC4wMi4wNGEyIDIgMCAwIDAgMS40NS0uODRjLjMzLS40MiAxLjgtMi43MSAzLjA4LTMuNzdxLjYzLS41MyAxLjE4LS42NC41Mi0uMS45NS4xNWwuMjUuMjIuMS4xNS4wOC4xOWMuMDYuMTguMS40My0uMDIuNzhxLS4wNC4xNS0uNDIuN2MtLjc4IDEuMS0yLjYyIDMuNDQtMi44MiAzLjcxLTEuOTIgMi40NC0xLjYyIDIuNzMtMS45IDQuNTYtLjgzIDUuMjUtMS4yIDUuNTctMS42NCA2LjUxYTIgMiAwIDAgMC0uMS40NGMtLjQ1IDIuOTUtLjE2IDIuOTYuMTIgNS4wOWwuMiAyYy4wNC4zLjA2LjM1LjE2LjU4YS42LjYgMCAwIDEtLjQuODJzLTMuMy44NC00Ljg4LjljLTEuNTYuMDUtNC42My0uNTYtNC42My0uNTZhLjYuNiAwIDAgMS0uNDctLjc1Yy4xNi0uNi4xNy0xLjExLjE1LTEuNzctLjAzLTEuMDctLjE2LTIuNDgtLjA1LTVsLS4wNS0uMDZxLS4xLS4xNC0uMjEtLjM0Yy0uMDYtLjA5LS4xMS0uMi0uMjMtLjMtLjctLjYzLTIuNDQtMS44Mi0zLjU2LTIuNjdhNyA3IDAgMCAxLTEuMS0uOTZjLS4yMi0uMy0uMS0uNC0uODMtMS4wN2wtLjU5LS41M2MtLjE2LS4xNy0uMjgtLjQtLjQ1LS41Ni0uMTktLjE4LS40Mi0uMy0uNjMtLjQ1bC0uNzQtLjZjLS4xOC0uMTMtLjI4LS4xNC0uMzktLjE5YTIgMiAwIDAgMS0uNTQtLjMzcS0uMy0uMjYtLjQ1LS40NGwtLjEzLS4xM3EtLjA4LS4wMy0uMjkgMGgtLjA1YS42LjYgMCAwIDEtLjU3LS4zOWwtLjEtLjI3LS4wMi0uMDRMNSAyMC4xYTEgMSAwIDAgMSAwLS41MWMuMDgtLjQ1LjM5LTEuMTIgMS4xLTEuNS42LS4zMyAxLjU3LS40NyAzLjAyLjE0IDEuNi42NyAyIDEuNDkgMi45IDIuMTEuMDcuMDYuNDcuMzMuOTQuNTNxLjMuMTMuNi4xN2MuMTUtLjE4LjItLjI0LjUxLS40Mm0tNy44Mi0uODhjLjM0LjA0LjUzLjE4LjczLjM4LjEyLjEyLjI0LjI3LjQ2LjQ3LjE2LjEzLjI0LjE0LjM0LjE4LjE1LjA1LjMxLjEyLjU1LjNsLjc0LjZjLjI0LjE4LjUuMzIuNzIuNTMuMTkuMTguMzIuNDEuNS42cS4yNS4yNS41My40OGMuODYuOC43My45Ljk5IDEuMjUuMS4xNC40My40Ljg1LjcgMS4xNS44OCAyLjkzIDIuMSAzLjY0IDIuNzQuMzIuMjguNDEuNTguNTcuNzhxLjEzLjEyLjIyLjI2YS42LjYgMCAwIDEgLjEuMzdjLS4xMiAyLjYzLjAyIDQuMDcuMDUgNS4xNS4wMi41NS4wMSAxLjAxLS4wNiAxLjQ4LjkzLjE3IDIuNy40NiAzLjc2LjQyIDEuMDgtLjA0IDMtLjQ2IDQtLjdsLS4wNC0uMjUtLjItMS45OGMtLjMtMi4yNy0uNi0yLjI4LS4xMi01LjQyLjA3LS40OC4xOC0uNy4yLS43Ni40MS0uOS43NS0xLjIgMS41NC02LjIuMzItMi4wNS0uMDEtMi4zNyAyLjE0LTUuMTIuMi0uMjYgMi4wMi0yLjU3IDIuNzktMy42NmwuMTktLjI4LS4wNi4wM3EtLjI0LjExLS40OS4zM2MtMS4yMiAxLTIuNTggMy4xOC0yLjkgMy41OWEzLjMgMy4zIDAgMCAxLTIuNjkgMS4zLjYuNiAwIDAgMCAuNDctLjk5bC0uNDcgMS0uNDgtLjI1LS4yNi0uMzMuNDYuMjItLjU2LS40YTMgMyAwIDAgMS0uMDgtMS4zNGMuMTEtMS4wMi41LTIuMjMuNTItMi4yOC4zMi0xLjE5LjItMS4yLjI4LTIuNDMuMTQtMi4zOS42LTMuNjkuNTktNC4wMyAwLS4xMi0uMDktLjMtLjItLjQ1bC0uMTQtLjE3LS4wNS0uMDQtLjExLjExcS0uMjMuMy0uNDUgMS4wMWMtLjA1LjE1LS44MiAzLjQ5LS44OSAzLjgtLjQyIDEuOC0uMzQgMi4zNS0uNzMgMy43NGwtLjA3LjU0YS42LjYgMCAwIDEtLjc0LjVxLS44My0uMTctMS0xLjQyYy0uMTItMS4xNi4yMy0zLjIyLS4xNC01LjA3bC0uMTItLjU4Yy0uMDYtLjI1LS4xNi0yLjI0LS4xNy0yLjQ0LS4wMi0uNCAwLS45Mi0uMDItMS4zMy0uMDEtLjE2IDAtLjMtLjA1LS4zNy0uMjItLjM0LS41OC0uMDEtLjY3LjIzLS4zLjgtLjE2IDIuNy0uMjUgNC4wN2wtLjEgMS4yMmMtLjA2Ljk4LjExIDIuMjMuMTcgMy4yNS4wNS44MiAwIDEuNTItLjE3IDEuOTNhMSAxIDAgMCAxLS4yMi4yNWwtLjI4LjItLjM1LjFoLS4xYTEuNCAxLjQgMCAwIDEtLjkyLS42NCAzIDMgMCAwIDEtLjM3LS44N2MtLjMtMS4yLS4yOC0xLjc5LTEuNjQtNS40NS0uMzQtLjkxLS4yMi0uOTgtLjQtMS40LS4wMy0uMDctLjItLjQ2LS40LS44MXEtLjEyLS4yMi0uMjUtLjM0bC0uMS4wNmExIDEgMCAwIDAtLjIzLjM4IDEgMSAwIDAgMC0uMDguMzljLS4wNC42LjAyLjYgMS4wMiA1Ljg4LjQyIDIuMjUuNSAyLjIzLjYzIDIuOWE3LjYgNy42IDAgMCAxLS43MSA1LjFjLS4zLjUtLjYuOC0uNzcuOS0uMjUuMTQtLjIyLjE3LS40LjM5YS42LjYgMCAwIDEtLjQxLjJjLTEuMDYuMDktMi4zOS0uNzktMi41Ny0uOTItLjM3LS4yNS0uNjYtLjU0LS45OC0uODVhNSA1IDAgMCAwLTEuNjgtMS4xM2MtMS41OS0uNjYtMi4yMy4wOC0yLjQxLjM5Ii8+PHBhdGggZmlsbD0iI2ZmYmYwMCIgZD0iTTI4LjE4IDI0LjcyYTIuNiAyLjYgMCAwIDAgMS44LTEuODFsLjU1LTJjLjI1LS45NiAxLjYtLjk2IDEuODYgMGwuNTQgMmMuMjQuODguOTMgMS41NyAxLjgxIDEuOGwyIC41NWMuOTYuMjUuOTYgMS42IDAgMS44NmwtMiAuNTRjLS44OC4yMy0xLjU3LjkzLTEuODEgMS44bC0uNTQgMi4wMmEuOTYuOTYgMCAwIDEtMS44NiAwbC0uNTQtMi4wMWEyLjYgMi42IDAgMCAwLTEuODEtMS44MWwtMi0uNTRhLjk2Ljk2IDAgMCAxIDAtMS44NnpNMy41IDcuMDljLjY2LS4xOCAxLjE4LS43IDEuMzYtMS4zNmwuNC0xLjVhLjcyLjcyIDAgMCAxIDEuNCAwbC40IDEuNWMuMTguNjYuNyAxLjE4IDEuMzYgMS4zNmwxLjUuNGMuNzIuMi43MiAxLjIgMCAxLjRsLTEuNS40Yy0uNjYuMTgtMS4xOC43LTEuMzYgMS4zNmwtLjQgMS41YS43Mi43MiAwIDAgMS0xLjQgMGwtLjQtMS41QTEuOSAxLjkgMCAwIDAgMy41IDkuMjlMMiA4Ljg5YS43Mi43MiAwIDAgMSAwLTEuNHoiLz48cGF0aCBmaWxsLW9wYWNpdHk9Ii41IiBmaWxsLXJ1bGU9Im5vbnplcm8iIGQ9Im0yOS45OCAyMC43Ny0uNTQgMmEyIDIgMCAwIDEtMS40NiAxLjQ3bC0yLjAxLjU0Yy0xLjQ0LjM4LTEuNDQgMi40MyAwIDIuODJsMi4wMS41NGMuNy4yIDEuMjcuNzUgMS40NiAxLjQ2bC41NCAyYy4zOCAxLjQ1IDIuNDMgMS40NSAyLjgyIDBsLjU0LTJjLjItLjcxLjc1LTEuMjcgMS40Ni0xLjQ2bDItLjU0YzEuNDUtLjM5IDEuNDUtMi40NCAwLTIuODJsLTItLjU0YTIgMiAwIDAgMS0xLjQ2LTEuNDZsLS41NC0yYy0uMzktMS40NS0yLjQ0LTEuNDUtMi44MiAwbTEuODYuMjUuNTMgMi4wMWEzIDMgMCAwIDAgMi4xNyAyLjE2bDIgLjU0Yy40Ni4xMy40Ni43NyAwIC45bC0yIC41NGEzIDMgMCAwIDAtMi4xNSAyLjE2bC0uNTUgMmEuNDUuNDUgMCAwIDEtLjg4IDBsLS41NS0yYTMgMyAwIDAgMC0yLjE2LTIuMTZsLTItLjU0Yy0uNDYtLjEzLS40Ni0uNzctLjAxLS45bDIuMDEtLjU0YTMgMyAwIDAgMCAyLjE2LTIuMTZsLjU0LTJhLjQ3LjQ3IDAgMCAxIC45IDAiLz48cGF0aCBmaWxsLW9wYWNpdHk9Ii40IiBmaWxsLXJ1bGU9Im5vbnplcm8iIGQ9Im00LjcxIDQuMDktLjQgMS41Yy0uMTQuNS0uNTIuODgtMS4wMSAxLjAxbC0xLjUuNDFjLTEuMjEuMzItMS4yMSAyLjAzIDAgMi4zNmwxLjUuNGMuNDkuMTMuODcuNTIgMSAxbC40MSAxLjUyYy4zMiAxLjIgMi4wMyAxLjIgMi4zNiAwbC40LTEuNTFjLjE0LS41LjUyLS44NyAxLTFsMS41Mi0uNDFjMS4yLS4zMyAxLjItMi4wNCAwLTIuMzZsLTEuNS0uNGExLjQgMS40IDAgMCAxLTEuMDItMWwtLjQtMS41MmMtLjMyLTEuMi0yLjA0LTEuMi0yLjM2IDBtMS40LjI2LjQgMS41MWEyLjQgMi40IDAgMCAwIDEuNzEgMS43bDEuNS40MmMuMjIuMDUuMjIuMzcgMCAuNDJsLTEuNS40Yy0uODMuMjQtMS40OS44OS0xLjcxIDEuNzNsLS40IDEuNWEuMjIuMjIgMCAwIDEtLjQzIDBsLS40MS0xLjVhMi40IDIuNCAwIDAgMC0xLjcxLTEuNzFsLTEuNS0uNGMtLjIyLS4wNi0uMjItLjM4IDAtLjQzbDEuNS0uNDFhMi40IDIuNCAwIDAgMCAxLjctMS43MWwuNDItMS41Yy4wNS0uMjIuMzctLjIyLjQyIDAiLz48cGF0aCBmaWxsLW9wYWNpdHk9Ii4yNSIgZmlsbC1ydWxlPSJub256ZXJvIiBkPSJNMzYuOTggMS4wM2ExLjE2IDEuMTYgMCAwIDEgMS4xNSAxLjAydjcuMDhhMS4xNiAxLjE2IDAgMCAxLTEuMTUgMS4xNiAxLjE2IDEuMTYgMCAwIDEtMS4xNi0xLjAyVjMuMzRoLTUuNzlhMS4xNiAxLjE2IDAgMCAxLTEuMTUtMS4wMXYtLjE0YTEuMTYgMS4xNiAwIDAgMSAxLjAxLTEuMTZ6TTIuMjYgMzguMDZhMS4xNiAxLjE2IDAgMCAxLTEuMTYtMS4wMXYtNy4wOWExLjE2IDEuMTYgMCAwIDEgMS4xNi0xLjE1IDEuMTYgMS4xNiAwIDAgMSAxLjE1IDEuMDF2NS45M2g1LjhhMS4xNiAxLjE2IDAgMCAxIDEuMTUgMS4wMnYuMTRhMS4xNiAxLjE2IDAgMCAxLTEuMDIgMS4xNXoiLz48L3N2Zz4=';

/**
 * Remote copies of the MediaPipe assets, used when the bundled ones fail to
 * load. The tasks-vision version here has to be kept in step with the
 * dependency in scratch-vm's and scratch-gui's package.json: the package's `exports` map hides
 * its own package.json, so the version can't be read at runtime.
 * @readonly
 */
const FALLBACK_WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const FALLBACK_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/' +
    'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * Hand part menu values: the hand landmarker keypoint names of the wrist
 * and fingertips, plus the palm center, which has no keypoint of its own.
 * @readonly
 * @enum {string}
 */
const PARTS = {
    WRIST: 'wrist',
    THUMB_TIP: 'thumb_tip',
    INDEX_FINGER_TIP: 'index_finger_tip',
    MIDDLE_FINGER_TIP: 'middle_finger_tip',
    RING_FINGER_TIP: 'ring_finger_tip',
    PINKY_FINGER_TIP: 'pinky_finger_tip',
    PALM_CENTER: 'palm_center'
};

/**
 * Hand menu values: the user's own left and right hands, as they see them in
 * the mirrored video.
 * @readonly
 * @enum {string}
 */
const HAND_CHOICE = {
    LEFT: 'left',
    RIGHT: 'right'
};

/**
 * Gesture menu values.
 * @readonly
 * @enum {string}
 */
const GESTURES = {
    OPEN: 'open',
    CLOSED: 'closed'
};

/**
 * On/off menu values for the pinch-drag command.
 * @readonly
 * @enum {string}
 */
const DRAG_STATE = {
    ON: 'on',
    OFF: 'off'
};

/**
 * Landmark indices [near-tip joint, tip] of each finger, keyed by its
 * fingertip part. A finger points from the joint nearest its tip (the DIP, or
 * the IP for the thumb) toward the tip. The fingertip parts double as the
 * finger menu values, so the finger menu is the part menu without the wrist
 * and palm.
 * @readonly
 */
const FINGER_NEAR_TIP = {
    [PARTS.THUMB_TIP]: [3, 4],
    [PARTS.INDEX_FINGER_TIP]: [7, 8],
    [PARTS.MIDDLE_FINGER_TIP]: [11, 12],
    [PARTS.RING_FINGER_TIP]: [15, 16],
    [PARTS.PINKY_FINGER_TIP]: [19, 20]
};

/**
 * Thumb-tip-to-index-tip distance, as a fraction of the hand's own size, at or
 * below which a pinch is considered active ("on"). Used both to start a pinch
 * and to keep a dragged sprite following the pinch point. Kept tight so the
 * sprite stops following as soon as the fingers begin to open.
 * @type {number}
 */
const PINCH_ON_RATIO = 0.3;

/**
 * Fraction of hand size above which an active pinch is considered fully
 * released ("off"). Larger than PINCH_ON_RATIO to form a hysteresis band:
 * between the two an in-progress pinch is held but the sprite stops following,
 * so brief detection glitches don't drop the grab yet the sprite doesn't drift
 * as the fingers spread on release.
 * @type {number}
 */
const PINCH_OFF_RATIO = 0.45;

/**
 * Number of consecutive non-pinch frames required to end a pinch. The pinch
 * state turns on immediately when a pinch is detected, but only turns off after
 * this many frames in a row report no pinch. This hysteresis prevents brief
 * detection glitches (false negatives) from interrupting an ongoing pinch.
 * @type {number}
 */
const PINCH_RELEASE_FRAMES = 3;

/**
 * Pinch ratio (thumb-to-index gap as a fraction of hand size) that the pinch
 * distance reporter reads as 0. Fingertip landmarks sit at the centers of the
 * finger pads, so tips pressed together still measure roughly this far apart;
 * anything tighter clamps to 0, which also hides landmark jitter while pinched.
 * On the reporter's scale PINCH_ON_RATIO reads 15 and PINCH_OFF_RATIO reads 30.
 * Like those, derived from hand proportions rather than calibrated against a
 * live camera.
 * @type {number}
 */
const PINCH_DISTANCE_CLOSED_RATIO = 0.15;

/**
 * Pinch ratio that the pinch distance reporter reads as 100: thumb and index
 * finger spread into a comfortable "L", a little short of the widest a hand can
 * stretch, so 100 is reachable without straining.
 * @type {number}
 */
const PINCH_DISTANCE_OPEN_RATIO = 1.15;

/**
 * Openness (mean finger extension, 0 to 1) at or above which a hand is open:
 * about three straight fingers. Between this and HAND_CLOSED_RATIO a hand keeps
 * its previous state, which gives finger wobble a wide band to happen in
 * without flipping the gesture.
 * @type {number}
 */
const HAND_OPEN_RATIO = 0.7;

/**
 * Openness at or below which a hand is closed: about one straight finger at
 * most, so a pointing hand counts as closed.
 * @type {number}
 */
const HAND_CLOSED_RATIO = 0.3;

/**
 * Number of consecutive undetected frames after which a hand's open/closed
 * state is forgotten. Matches PINCH_RELEASE_FRAMES: detection drops out for a
 * frame or two whenever a hand outruns tracking.
 * @type {number}
 */
const GESTURE_RELEASE_FRAMES = 3;

/**
 * Number of frames in a row that may fail before the detector is given up on.
 * One bad frame is a blip; a run of them means the detector is broken, most
 * likely a worker whose GL context is gone, which would otherwise fail every
 * frame from then on without a word.
 * @type {number}
 */
const MAX_CONSECUTIVE_DETECT_ERRORS = 10;

/**
 * How often the detection rate in `stats.fps` is recomputed.
 * @type {number}
 */
const FPS_WINDOW_MS = 2000;

/**
 * @typedef {object} HandSensingState - the hand sensing state associated with a particular target.
 * @property {boolean} pinchDragEnabled - tracks whether pinching can grab and drag this target.
 */

/**
 * Class for the Hand Sensing blocks in Scratch 3.0
 * @param {Runtime} runtime - the runtime instantiating this block package.
 * @class
 */
class Scratch3HandSensingBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        /**
         * All detected hands from the latest frame.
         * @type {Array.<object>}
         */
        this._allHands = [];

        /**
         * Smoothed (hysteresis-filtered) pinch state per hand, keyed by
         * handedness label ('Left'/'Right').
         * @type {object}
         */
        this._pinchState = {};

        /**
         * Recent raw pinch detection history per hand, keyed by handedness label.
         * Used to apply the release hysteresis.
         * @type {object}
         */
        this._pinchHistory = {};

        /**
         * Open (true) or closed (false) state per hand, keyed by handedness
         * label ('Left'/'Right'). Absent for a hand not seen recently.
         * @type {object}
         */
        this._openState = {};

        /**
         * Consecutive frames each hand has gone undetected, keyed by handedness
         * label. Used to hold a gesture through brief detection dropouts.
         * @type {object}
         */
        this._gestureMissingFrames = {};

        /**
         * Active pinch drags, keyed by hand handedness label ('Left'/'Right').
         * Each entry holds the dragged target's id and the offset between the
         * sprite position and the pinch point at the moment it was grabbed.
         * @type {object}
         */
        this._pinchDrags = {};

        /**
         * Timestamp given to the most recent inference. HandLandmarker requires
         * strictly increasing video timestamps, so this is carried forward when
         * two frames land in the same millisecond.
         * @type {number}
         */
        this._lastFrameTimestamp = 0;

        /**
         * The detector running inference, once one is ready. Null until then,
         * and again once detection has stopped for good.
         * @type {?HandDetector}
         */
        this._detector = null;

        /**
         * Frames in a row that have failed to process.
         * @type {number}
         */
        this._consecutiveErrors = 0;

        /**
         * When the extension started loading, for `stats.initMs`.
         * @type {number}
         */
        this._createdAt = Date.now();

        /**
         * Start of the window `stats.fps` is being counted over, and the
         * results counted so far in it.
         * @type {number}
         */
        this._fpsWindowStart = 0;
        this._fpsWindowResults = 0;

        /**
         * Diagnostics for the detection pipeline, readable in a browser
         * console as `vm.runtime.ext_handSensing.stats`.
         * @type {object}
         */
        this.stats = Scratch3HandSensingBlocks.initialStats();

        this.runtime.emit('EXTENSION_DATA_LOADING', true);

        // Resolve the bundled MediaPipe assets against the page's base path so
        // they load whether the editor is served from the domain root or a
        // subdirectory (e.g. GitHub Pages, where an absolute "/chunks/..." path
        // resolves to the domain root and 404s).
        const assetBase = (typeof window !== 'undefined' && window.location) ?
            `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}` :
            '/';
        const localRoot = `${assetBase}chunks/mediapipe/tasks-vision`;

        /**
         * Where to load the landmarker from, most preferred first: the copies
         * bundled with the editor, then the remote fallbacks.
         * @type {Array.<AssetSet>}
         */
        this._assetSets = [
            {wasmRoot: `${localRoot}/wasm`, modelPath: `${localRoot}/hand_landmarker.task`},
            {wasmRoot: FALLBACK_WASM_ROOT, modelPath: FALLBACK_MODEL_URL}
        ];

        /**
         * URL of the inference worker, which scratch-vm's build emits next to
         * extension-worker.js and the editor copies to the same place.
         * @type {string}
         */
        this._workerUrl = `${assetBase}hand-sensing-worker.js`;

        this.runtime.ext_handSensing = this;

        this._createDetector(true)
            .then(detector => {
                this._detector = detector;
                if (this.runtime.ioDevices) {
                    this._loop();
                }
            })
            .catch(error => this._stopDetection(error));

        this._onTargetCreated = this._onTargetCreated.bind(this);
        this.runtime.on('targetWasCreated', this._onTargetCreated);

        this._onProjectStopAll = this._onProjectStopAll.bind(this);
        this.runtime.on('PROJECT_STOP_ALL', this._onProjectStopAll);
    }

    /**
     * The key to load & store a target's hand sensing state.
     * @type {string}
     */
    static get STATE_KEY () {
        return 'Scratch.handSensing';
    }

    /**
     * The default hand sensing state, to be used when a target has no existing state.
     * @type {HandSensingState}
     */
    static get DEFAULT_STATE () {
        return {
            pinchDragEnabled: false
        };
    }

    /**
     * After analyzing a frame the amount of milliseconds until another frame
     * is analyzed.
     * @type {number}
     */
    static get INTERVAL () {
        return 1000 / 15;
    }

    /**
     * Dimensions the video stream is analyzed at after it's rendered to the
     * sample canvas.
     * @type {Array.<number>}
     */
    static get DIMENSIONS () {
        return DIMENSIONS;
    }

    /**
     * The diagnostics kept in `stats` before anything has happened.
     * @returns {object} fresh stats
     */
    static initialStats () {
        return {
            thread: null,
            delegate: null,
            renderer: null,
            assets: null,
            inferenceMs: NaN,
            fps: 0,
            framesSent: 0,
            resultsReceived: 0,
            framesSkipped: 0,
            errors: 0,
            lastError: null,
            initMs: null
        };
    }

    /**
     * The hand part menu.
     * @type {object[]}
     */
    get PART_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.wrist',
                default: 'wrist',
                description: 'Option in the hand part menu'
            }),
            value: PARTS.WRIST
        }, {
            text: formatMessage({
                id: 'handSensing.thumbTip',
                default: 'thumb',
                description: 'Option in the hand part and finger menus'
            }),
            value: PARTS.THUMB_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.indexFingerTip',
                default: 'index finger',
                description: 'Option in the hand part and finger menus'
            }),
            value: PARTS.INDEX_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.middleFingerTip',
                default: 'middle finger',
                description: 'Option in the hand part and finger menus'
            }),
            value: PARTS.MIDDLE_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.ringFingerTip',
                default: 'ring finger',
                description: 'Option in the hand part and finger menus'
            }),
            value: PARTS.RING_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.pinkyFingerTip',
                default: 'pinky finger',
                description: 'Option in the hand part and finger menus'
            }),
            value: PARTS.PINKY_FINGER_TIP
        }, {
            text: formatMessage({
                id: 'handSensing.palmCenter',
                default: 'palm',
                description: 'Option in the hand part menu'
            }),
            value: PARTS.PALM_CENTER
        }];
    }

    /**
     * The finger menu: the hand parts that are fingertips.
     * @type {object[]}
     */
    get FINGER_INFO () {
        return this.PART_INFO.filter(({value}) => value in FINGER_NEAR_TIP);
    }

    /**
     * The hand menu.
     * @type {object[]}
     */
    get HAND_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.left',
                default: 'left',
                description: 'Option to detect the left hand'
            }),
            value: HAND_CHOICE.LEFT
        }, {
            text: formatMessage({
                id: 'handSensing.right',
                default: 'right',
                description: 'Option to detect the right hand'
            }),
            value: HAND_CHOICE.RIGHT
        }];
    }

    /**
     * Gesture menu for hat blocks (verb forms: opens, closes). Pinching is not
     * a menu gesture; it drives the pinch-drag command instead.
     * @type {object[]}
     */
    get GESTURE_HAT_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.gestureOpens',
                default: 'opens',
                description: 'Option for hand opening gesture (hat block)'
            }),
            value: GESTURES.OPEN
        }, {
            text: formatMessage({
                id: 'handSensing.gestureCloses',
                default: 'closes',
                description: 'Option for hand closing gesture (hat block)'
            }),
            value: GESTURES.CLOSED
        }];
    }

    /**
     * Gesture menu for boolean blocks (state forms: open, closed). Pinching is
     * not a menu gesture; it drives the pinch-drag command instead.
     * @type {object[]}
     */
    get GESTURE_STATE_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.gestureOpen',
                default: 'open',
                description: 'Option for hand open state (boolean block)'
            }),
            value: GESTURES.OPEN
        }, {
            text: formatMessage({
                id: 'handSensing.gestureClosed',
                default: 'closed',
                description: 'Option for hand closed state (boolean block)'
            }),
            value: GESTURES.CLOSED
        }];
    }

    /**
     * On/off menu for the pinch-drag command.
     * @type {object[]}
     */
    get DRAG_INFO () {
        return [{
            text: formatMessage({
                id: 'handSensing.on',
                default: 'on',
                description: 'Option to turn pinch dragging on'
            }),
            value: DRAG_STATE.ON
        }, {
            text: formatMessage({
                id: 'handSensing.off',
                default: 'off',
                description: 'Option to turn pinch dragging off'
            }),
            value: DRAG_STATE.OFF
        }];
    }

    /**
     * The detected hand matching a hand menu choice.
     * @param {string} handChoice - one of HAND_CHOICE
     * @returns {?object} the hand, or null if it is not in view
     * @private
     */
    _selectHand (handChoice) {
        const label = this._labelFor(handChoice);
        return this._allHands.find(hand => hand.handedness === label) || null;
    }

    /**
     * The handedness label for a hand menu choice. Detected hands carry the
     * user's own handedness (translateResult undoes the mirrored frame), so
     * "Right" is the user's own right hand.
     * @param {string} handChoice - one of HAND_CHOICE
     * @returns {string} the matching handedness label
     * @private
     */
    _labelFor (handChoice) {
        return handChoice === HAND_CHOICE.RIGHT ? 'Right' : 'Left';
    }

    /**
     * Create the detector that will run inference: in a worker when one can be
     * started, otherwise on the main thread. A worker fails to start where
     * workers cannot be created at all (a page loaded over file://, or a build
     * missing the worker bundle) or where it cannot draw (no WebGL2 in workers);
     * the main thread then loads the same assets itself.
     * @param {boolean} useWorker - whether to try the worker first
     * @returns {Promise.<HandDetector>} the ready detector
     * @private
     */
    _createDetector (useWorker) {
        const detector = useWorker ?
            new Promise(resolve => resolve(new Worker(this._workerUrl)))
                .then(worker => createWorkerDetector(worker, this._assetSets))
                .catch(error => {
                    log.warn(`hand sensing: inference worker unavailable at ${this._workerUrl} ` +
                        `(${error.message}); running inference on the main thread`);
                    return createMainThreadDetector(this._assetSets);
                }) :
            createMainThreadDetector(this._assetSets);
        return detector.then(created => {
            this._describeDetector(created);
            return created;
        });
    }

    /**
     * Record how a detector came up in `stats`, and say so once in the console.
     * @param {HandDetector} detector - the detector that just became ready
     * @private
     */
    _describeDetector (detector) {
        const assets = detector.wasmRoot === FALLBACK_WASM_ROOT ? 'CDN' : 'local';
        Object.assign(this.stats, {
            thread: detector.thread,
            delegate: detector.delegate,
            renderer: detector.renderer,
            assets
        });
        // On a software GPU the CPU delegate is the right choice, not a problem.
        if (detector.delegate === 'CPU' && !isSoftwareRenderer(detector.renderer)) {
            log.warn('hand sensing: the GPU delegate is unavailable; inference is running on the CPU delegate');
        }
        if (assets === 'CDN') {
            log.warn('hand sensing: the bundled MediaPipe assets failed to load; using the remote copies');
        }
        log.info(`hand sensing: detecting in ${detector.thread} thread (${detector.delegate} delegate, ` +
            `${assets} assets, renderer "${detector.renderer}")`);
    }

    /**
     * Detect hands frame after frame for as long as a detector is running.
     * One frame is in flight at a time: the next capture is only scheduled
     * once the previous frame has settled, so a slow device is never asked
     * for more than it can do. In a worker the wait is paced by how long
     * inference has been taking, leaving the rest of the machine room to
     * breathe; on the main thread the full interval follows the synchronous
     * work, since the thread was busy throughout.
     * @private
     */
    _loop () {
        const capturedAt = Date.now();
        this._detectFrame()
            .catch(error => this._handleDetectError(error))
            .then(() => {
                if (!this._detector) return;
                const intervalMs = Math.max(this.runtime.currentStepTime, Scratch3HandSensingBlocks.INTERVAL);
                const delay = this._detector.thread === 'worker' ?
                    nextCaptureDelay({
                        intervalMs,
                        inferenceMs: this.stats.inferenceMs,
                        elapsedMs: Date.now() - capturedAt
                    }) :
                    intervalMs;
                setTimeout(this._loop.bind(this), delay);
            }, error => this._stopDetection(error));
    }

    /**
     * Capture one frame and run it through the detector, folding the result
     * into the hand, gesture, pinch and drag state the blocks read.
     * @returns {Promise} settles once the frame has been handled, or rejects
     *     with the detector's error
     * @private
     */
    _detectFrame () {
        if (!this._firstTime && this._videoLoadingCompleted) {
            this.runtime.emit('EXTENSION_DATA_LOADING', false);
            this._firstTime = true;
        }

        // Skip inference while the page is hidden (e.g. a backgrounded tab) so we
        // don't burn CPU/GPU/battery on a camera the user can't see. The loop keeps
        // rescheduling and resumes automatically once the page is visible again.
        const pageVisible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
        const frame = pageVisible && this.runtime.ioDevices.video.getFrame({
            format: Video.FORMAT_CANVAS,
            dimensions: Scratch3HandSensingBlocks.DIMENSIONS,
            cacheTimeout: this.runtime.currentStepTime
        });
        if (!frame) {
            this.stats.framesSkipped++;
            return Promise.resolve();
        }

        this._lastFrameTimestamp = Math.max(Date.now(), this._lastFrameTimestamp + 1);
        this.stats.framesSent++;
        return this._detector.detect(frame, this._lastFrameTimestamp).then(({hands, inferenceMs}) => {
            this._recordResult(inferenceMs);
            this._allHands = hands;
            if (hands.length > 0 && !this._firstTime) {
                this._firstTime = true;
                this.runtime.emit('EXTENSION_DATA_LOADING', false);
            }
            this._updatePinchStates();
            this._updateGestureStates();
            this._updatePinchDrags();
        });
    }

    /**
     * Fold one successful inference into `stats`.
     * @param {number} inferenceMs - how long the inference took
     * @private
     */
    _recordResult (inferenceMs) {
        const stats = this.stats;
        this._consecutiveErrors = 0;
        stats.resultsReceived++;
        stats.inferenceMs = smoothInferenceMs(stats.inferenceMs, inferenceMs);
        const now = Date.now();
        if (stats.initMs === null) {
            stats.initMs = now - this._createdAt;
            this._fpsWindowStart = now;
        }
        this._fpsWindowResults++;
        const windowMs = now - this._fpsWindowStart;
        if (windowMs >= FPS_WINDOW_MS) {
            stats.fps = Math.round(this._fpsWindowResults * 10000 / windowMs) / 10;
            this._fpsWindowStart = now;
            this._fpsWindowResults = 0;
        }
    }

    /**
     * Deal with a frame the detector failed on. A single bad frame is counted
     * and, the first time in a run, mentioned in the console. A fatal error
     * from the worker, or a long enough run of failures, means the worker is
     * gone: it is shut down and inference moves to the main thread. The same
     * happening on the main thread leaves nowhere to go, so detection stops.
     * @param {Error} error - the detector's error, `fatal` if it cannot recover
     * @returns {Promise|undefined} settles once a replacement detector is
     *     running, if one was needed; rejects if none could be made
     * @private
     */
    _handleDetectError (error) {
        this.stats.errors++;
        this.stats.lastError = error.message;
        this._consecutiveErrors++;
        if (!error.fatal && this._consecutiveErrors < MAX_CONSECUTIVE_DETECT_ERRORS) {
            if (this._consecutiveErrors === 1) {
                log.warn(`hand sensing: a frame failed to process (${error.message})`);
            }
            return;
        }

        const failed = this._detector;
        this._detector = null;
        this._consecutiveErrors = 0;
        if (!failed || failed.thread !== 'worker') {
            throw error;
        }
        failed.terminate();
        log.warn(`hand sensing: the inference worker died (${error.message}); ` +
            'restarting inference on the main thread');
        return this._createDetector(false).then(detector => {
            this._detector = detector;
        });
    }

    /**
     * Give up on detection for the rest of the session: nothing can run
     * inference. The blocks keep working and report no hands.
     * @param {Error} error - why
     * @private
     */
    _stopDetection (error) {
        log.error(`hand sensing: detection unavailable: ${error.message}`);
        if (this._detector) this._detector.terminate();
        this._detector = null;
        this._allHands = [];
        this.stats.lastError = error.message;
        if (!this._firstTime) {
            this._firstTime = true;
            this.runtime.emit('EXTENSION_DATA_LOADING', false);
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        // Enable the video layer
        this.runtime.ioDevices.video.enableVideo()
            .finally(() => {
                this._videoLoadingCompleted = true;
            });

        return {
            id: 'handSensing',
            name: formatMessage({
                id: 'handSensing.categoryName',
                default: 'Hand Sensing',
                description: 'Name of hand sensing extension'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'goToPart',
                    text: formatMessage({
                        id: 'handSensing.goToPart',
                        default: 'go to [HAND][PART]',
                        description: 'Command that moves target to [PART] of [HAND] hand'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        PART: {
                            type: ArgumentType.STRING,
                            menu: 'PART',
                            defaultValue: PARTS.INDEX_FINGER_TIP
                        },
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                {
                    opcode: 'pointInDirectionOfFinger',
                    text: formatMessage({
                        id: 'handSensing.pointInDirectionOfFinger',
                        default: 'point in direction of [HAND] [FINGER]',
                        description: 'Command that points the sprite the way a finger is pointing'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        FINGER: {
                            type: ArgumentType.STRING,
                            menu: 'FINGER',
                            defaultValue: PARTS.INDEX_FINGER_TIP
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'whenGesture',
                    text: formatMessage({
                        id: 'handSensing.whenGesture',
                        default: 'when [HAND] hand [GESTURE]',
                        description: 'Event that triggers when a hand gesture is detected'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        GESTURE: {
                            type: ArgumentType.STRING,
                            menu: 'GESTURE_HAT',
                            defaultValue: GESTURES.OPEN
                        }
                    }
                },
                {
                    opcode: 'whenSpriteTouchesPart',
                    text: formatMessage({
                        id: 'handSensing.whenSpriteTouchesPart',
                        default: 'when this sprite touches [HAND] [PART]',
                        description: 'Event that triggers when sprite touches a [PART] on [HAND] hand'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        PART: {
                            type: ArgumentType.STRING,
                            menu: 'PART',
                            defaultValue: PARTS.INDEX_FINGER_TIP
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'setPinchDrag',
                    text: formatMessage({
                        id: 'handSensing.setPinchDrag',
                        default: 'set pinch dragging [STATE]',
                        description: 'Command that turns pinch-to-drag mode on or off'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        STATE: {
                            type: ArgumentType.STRING,
                            menu: 'DRAG_STATE',
                            defaultValue: DRAG_STATE.ON
                        }
                    },
                    filter: [TargetType.SPRITE]
                },
                '---',
                {
                    opcode: 'handIsDetected',
                    text: formatMessage({
                        id: 'handSensing.handDetected',
                        default: '[HAND] hand detected?',
                        description: 'Reporter that returns whether a hand is detected'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    }
                },
                {
                    opcode: 'gestureDetected',
                    text: formatMessage({
                        id: 'handSensing.gestureDetected',
                        default: '[HAND] hand [GESTURE]?',
                        description: 'Boolean that returns whether a gesture is detected'
                    }),
                    blockType: BlockType.BOOLEAN,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        },
                        GESTURE: {
                            type: ArgumentType.STRING,
                            menu: 'GESTURE_STATE',
                            defaultValue: GESTURES.OPEN
                        }
                    }
                },
                {
                    opcode: 'pinchDistance',
                    text: formatMessage({
                        id: 'handSensing.pinchDistance',
                        default: '[HAND] hand pinch distance',
                        description: 'Reporter that returns how far apart the thumb and index fingertips are, ' +
                            'from 0 (touching) to 100 (spread wide)'
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        HAND: {
                            type: ArgumentType.STRING,
                            menu: 'HAND',
                            defaultValue: HAND_CHOICE.LEFT
                        }
                    }
                }
            ],
            menus: {
                PART: this.PART_INFO,
                FINGER: this.FINGER_INFO,
                HAND: this.HAND_INFO,
                GESTURE_HAT: this.GESTURE_HAT_INFO,
                GESTURE_STATE: this.GESTURE_STATE_INFO,
                DRAG_STATE: this.DRAG_INFO
            }
        };
    }

    /**
     * Where a part of a hand is, in Scratch coordinates.
     * @param {string} part - one of PARTS
     * @param {?object} hand - the hand, or null if it is not in view
     * @returns {?{x: number, y: number}} the position, or null if the hand or part is unavailable
     * @private
     */
    _getPartPosition (part, hand) {
        if (!hand) return null;
        if (part === PARTS.PALM_CENTER) return getPalmCenter(hand);
        const keypoint = hand.keypoints.find(kp => kp.name === part);
        return keypoint ? toScratchCoords(keypoint) : null;
    }

    /**
     * Update the open/closed state of each detected hand. Called once per
     * detection frame.
     *
     * Openness is one number, so open and closed are the two sides of one
     * state rather than two separate tests: a hand in view is always exactly
     * one of them. A Schmitt trigger keeps that state from chattering when a
     * finger hovers at its boundary: a hand becomes open only once its
     * openness rises to HAND_OPEN_RATIO and closed only once it falls to
     * HAND_CLOSED_RATIO, and in between it keeps whatever it was. A hand that
     * goes undetected keeps its state for GESTURE_RELEASE_FRAMES frames, since
     * detection drops out briefly whenever a hand outruns tracking, and is
     * then forgotten. The hat blocks read this held state, so they fire once
     * per real transition rather than on every wobble or dropped frame.
     * @private
     */
    _updateGestureStates () {
        const seen = new Set();
        for (const hand of this._allHands) {
            const label = hand.handedness;
            if (!label) continue;
            const openness = getHandOpenness(hand);
            if (openness < 0) continue;
            seen.add(label);
            this._gestureMissingFrames[label] = 0;

            if (openness >= HAND_OPEN_RATIO) {
                this._openState[label] = true;
            } else if (openness <= HAND_CLOSED_RATIO) {
                this._openState[label] = false;
            } else if (typeof this._openState[label] !== 'boolean') {
                // First sight of a hand already part-way: take the nearer side
                // rather than leave it with no gesture at all.
                this._openState[label] = openness >= (HAND_OPEN_RATIO + HAND_CLOSED_RATIO) / 2;
            }
        }

        for (const label of Object.keys(this._openState)) {
            if (seen.has(label)) continue;
            const missing = (this._gestureMissingFrames[label] || 0) + 1;
            if (missing >= GESTURE_RELEASE_FRAMES) {
                delete this._openState[label];
                delete this._gestureMissingFrames[label];
            } else {
                this._gestureMissingFrames[label] = missing;
            }
        }
    }

    /**
     * Update the hysteresis-filtered pinch state for each detected hand. Called
     * once per detection frame.
     *
     * Two levels of hysteresis are applied:
     *  - Distance (Schmitt trigger): a pinch starts when the fingers close to
     *    within PINCH_ON_RATIO of the hand's size and is only let go once they
     *    open past the larger PINCH_OFF_RATIO.
     *  - Time: the "off" transition additionally requires PINCH_RELEASE_FRAMES
     *    consecutive non-pinch frames, so a brief detection glitch does not drop
     *    an ongoing pinch.
     *
     * Both lean the same way, because losing a pinch part-way through a drag
     * costs the child far more than starting one a frame early.
     * @private
     */
    _updatePinchStates () {
        const seen = new Set();
        for (const hand of this._allHands) {
            const label = hand.handedness;
            if (!label) continue;
            seen.add(label);

            const ratio = getPinchRatio(hand);
            // Asymmetric threshold: harder to keep a pinch alive than to start
            // one would cause drift on release, so instead we require a tight
            // pinch to start (PINCH_ON_RATIO) and only fully release once
            // clearly open (PINCH_OFF_RATIO).
            const wasPinching = this._pinchState[label] === true;
            const threshold = wasPinching ? PINCH_OFF_RATIO : PINCH_ON_RATIO;
            this._recordPinchFrame(label, ratio >= 0 && ratio < threshold);
        }

        // A hand that went undetected counts as one non-pinch frame, exactly
        // like one whose fingers were open. Detection drops out for a frame or
        // two whenever a hand moves fast enough to outrun tracking, and that is
        // the very kind of glitch the release delay exists to absorb.
        for (const label of Object.keys(this._pinchState)) {
            if (!seen.has(label)) {
                this._recordPinchFrame(label, false);
            }
        }
    }

    /**
     * Fold a single frame's observation of one hand into its pinch state.
     * Pinches turn on the moment they are seen, and turn off only after
     * PINCH_RELEASE_FRAMES in a row without one.
     * @param {string} label - the handedness label of the hand
     * @param {boolean} rawPinch - whether that hand was pinching this frame
     * @private
     */
    _recordPinchFrame (label, rawPinch) {
        const history = this._pinchHistory[label] || [];
        history.push(rawPinch);
        if (history.length > PINCH_RELEASE_FRAMES) {
            history.shift();
        }
        this._pinchHistory[label] = history;

        if (rawPinch) {
            // Turn on immediately.
            this._pinchState[label] = true;
        } else if (history.length >= PINCH_RELEASE_FRAMES && history.every(p => !p)) {
            // Turn off only after a sustained release.
            this._pinchState[label] = false;
        }
        // Otherwise hold the previous state (hysteresis window).
    }

    /**
     * Whether a hand is tightly pinching right now (fingers within
     * PINCH_ON_RATIO of the hand's size), ignoring the hysteresis hold. A
     * dragged sprite only follows the pinch point while this is true, so it
     * stops moving as soon as the fingers begin to open rather than drifting
     * until the full release.
     * @param {object} hand - the hand object
     * @returns {boolean} true if the fingers are tightly pinched
     * @private
     */
    _isHandTightlyPinching (hand) {
        const ratio = getPinchRatio(hand);
        return ratio >= 0 && ratio < PINCH_ON_RATIO;
    }

    /**
     * Whether the chosen hand is in the given gesture state, read from the
     * per-hand state kept by `_updateGestureStates`. While a hand is in view
     * exactly one of open and closed is true; while none has been seen
     * recently, neither is. Reading the held state rather than the current
     * frame is what lets a gesture survive a dropped detection frame.
     * @param {string} gesture - one of GESTURES
     * @param {string} handChoice - one of HAND_CHOICE
     * @returns {boolean} true if the hand is in that state
     * @private
     */
    _detectGesture (gesture, handChoice) {
        const isOpen = this._openState[this._labelFor(handChoice)];
        if (typeof isOpen !== 'boolean') return false;
        return gesture === GESTURES.OPEN ? isOpen : !isOpen;
    }

    /**
     * A scratch command block handle that moves a target to a given hand keypoint
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    goToPart (args, util) {
        const position = this._getPartPosition(args.PART, this._selectHand(args.HAND));
        if (position) util.target.setXY(position.x, position.y);
    }

    /**
     * A scratch hat block that triggers when a gesture is detected.
     * @param {object} args - the block arguments
     * @returns {boolean} true if the gesture is detected
     */
    whenGesture (args) {
        return this._detectGesture(args.GESTURE, args.HAND);
    }

    /**
     * A scratch boolean block that reports whether a gesture is detected on a hand.
     * @param {object} args - the block arguments
     * @returns {boolean} true if the gesture is detected
     */
    gestureDetected (args) {
        return this._detectGesture(args.GESTURE, args.HAND);
    }

    /**
     * A scratch hat block handle that reports whether
     * a target sprite is touching a given hand keypoint
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     * @returns {boolean} - true if the sprite is touching the given point
     */
    whenSpriteTouchesPart (args, util) {
        const position = this._getPartPosition(args.PART, this._selectHand(args.HAND));
        return !!position && util.target.isTouchingScratchPoint(position.x, position.y);
    }

    /**
     * A scratch boolean block handle that reports whether
     * a hand is detected
     * @param {object} args - the block arguments
     * @returns {boolean} - true a hand was detected
     */
    handIsDetected (args) {
        return this._selectHand(args.HAND) !== null;
    }

    /**
     * Get the hand sensing state for a target, creating it if the target does
     * not have one yet.
     * @param {Target} target - the target to look up
     * @returns {HandSensingState} the mutable state for that target
     * @private
     */
    _getHandSensingState (target) {
        let state = target.getCustomState(Scratch3HandSensingBlocks.STATE_KEY);
        if (!state) {
            state = Clone.simple(Scratch3HandSensingBlocks.DEFAULT_STATE);
            target.setCustomState(Scratch3HandSensingBlocks.STATE_KEY, state);
        }
        return state;
    }

    /**
     * Whether pinching can grab and drag a target. Reads the state without
     * creating it, since this runs every frame across every target.
     * @param {Target} target - the target to check
     * @returns {boolean} true if pinch dragging is on for that target
     * @private
     */
    _isPinchDragEnabled (target) {
        const state = target.getCustomState(Scratch3HandSensingBlocks.STATE_KEY);
        return !!state && state.pinchDragEnabled;
    }

    /**
     * When a target using hand sensing is cloned, clone the hand sensing state.
     * @param {Target} newTarget - the newly created target.
     * @param {Target} [sourceTarget] - the target used as a source for the new clone, if any.
     * @listens Runtime#event:targetWasCreated
     * @private
     */
    _onTargetCreated (newTarget, sourceTarget) {
        if (sourceTarget) {
            const state = sourceTarget.getCustomState(Scratch3HandSensingBlocks.STATE_KEY);
            if (state) {
                newTarget.setCustomState(Scratch3HandSensingBlocks.STATE_KEY, Clone.simple(state));
            }
        }
    }

    /**
     * Turn pinch dragging off for every target and let go of anything a hand is
     * holding. The green flag stops everything before it starts, so this runs
     * for both the green flag and the stop button, leaving each sprite
     * ungrabbable until its `set pinch dragging on` block runs again.
     * @listens Runtime#event:PROJECT_STOP_ALL
     * @private
     */
    _onProjectStopAll () {
        for (const label of Object.keys(this._pinchDrags)) {
            this._releaseDrag(label);
        }
        for (const target of this.runtime.targets) {
            const state = target.getCustomState(Scratch3HandSensingBlocks.STATE_KEY);
            if (state) state.pinchDragEnabled = false;
        }
    }

    /**
     * A scratch command block that turns pinch-to-drag mode on or off for the
     * calling sprite. While on, pinching the thumb and index finger together
     * over this sprite's pixels grabs it and makes it follow the pinch until the
     * pinch is released. Each sprite and clone has its own setting; a clone
     * starts out with whatever its sprite had when the clone was created. The
     * green flag and the stop button turn it off again everywhere.
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    setPinchDrag (args, util) {
        const enabled = args.STATE === DRAG_STATE.ON;
        this._getHandSensingState(util.target).pinchDragEnabled = enabled;
        if (!enabled) {
            // Immediately release any active drag of this sprite.
            for (const label of Object.keys(this._pinchDrags)) {
                if (this._pinchDrags[label].targetId === util.target.id) {
                    this._releaseDrag(label);
                }
            }
        }
    }

    /**
     * Find the topmost pinch-draggable sprite whose pixels are touched by the
     * given point.
     * @param {number} x - Scratch x coordinate
     * @param {number} y - Scratch y coordinate
     * @param {Set.<string>} excludeIds - target ids to ignore (already being dragged)
     * @returns {?RenderedTarget} the topmost touched sprite, or null
     * @private
     */
    _pickTopSpriteAt (x, y, excludeIds) {
        const candidates = this.runtime.targets.filter(t =>
            !t.isStage &&
            this._isPinchDragEnabled(t) &&
            t.visible &&
            !excludeIds.has(t.id) &&
            t.isTouchingScratchPoint(x, y)
        );
        if (candidates.length === 0) return null;

        // Pick the frontmost candidate using the renderer's draw order
        // (drawables later in the list are drawn on top).
        const drawList = this.runtime.renderer && this.runtime.renderer._drawList;
        if (!drawList) return candidates[candidates.length - 1];

        let top = candidates[0];
        let topOrder = drawList.indexOf(top.drawableID);
        for (const t of candidates) {
            const order = drawList.indexOf(t.drawableID);
            if (order > topOrder) {
                topOrder = order;
                top = t;
            }
        }
        return top;
    }

    /**
     * Release a single active pinch drag and take its sprite out of the drag state.
     * @param {string} label - the handedness label keying the drag
     * @private
     */
    _releaseDrag (label) {
        const drag = this._pinchDrags[label];
        if (!drag) return;
        const target = this.runtime.getTargetById(drag.targetId);
        if (target) target.stopDrag();
        delete this._pinchDrags[label];
    }

    /**
     * Update pinch drags for the latest frame: release drags whose hand stopped
     * pinching, start new drags for pinching hands over a sprite, and move
     * already-grabbed sprites to follow their pinch point.
     * @private
     */
    _updatePinchDrags () {
        // Map each currently pinching hand by its handedness label, using the
        // hysteresis-filtered pinch state so glitches don't interrupt a drag.
        const pinchingByLabel = {};
        for (const hand of this._allHands) {
            if (this._pinchState[hand.handedness]) {
                pinchingByLabel[hand.handedness] = hand;
            }
        }

        // Release drags whose hand stopped pinching, or whose sprite is gone or
        // is no longer pinch-draggable. This asks the pinch state rather than
        // the hands detected this frame, so a hand that briefly went missing
        // keeps its grab for as long as its pinch survives. Its sprite simply
        // isn't in the follow loop below while there is no hand to follow, so it
        // holds still until the hand comes back or the pinch times out.
        for (const label of Object.keys(this._pinchDrags)) {
            const target = this.runtime.getTargetById(this._pinchDrags[label].targetId);
            if (!this._pinchState[label] || !target || !this._isPinchDragEnabled(target)) {
                this._releaseDrag(label);
            }
        }

        // Sprites already grabbed by another hand should not be grabbed again.
        const grabbedIds = new Set(
            Object.values(this._pinchDrags).map(drag => drag.targetId)
        );

        for (const label of Object.keys(pinchingByLabel)) {
            const hand = pinchingByLabel[label];
            const pinchPoint = getPinchPoint(hand);
            const scale = getPalmScale(hand);
            if (!pinchPoint || scale < 0) continue;

            const existing = this._pinchDrags[label];
            if (existing) {
                const target = this.runtime.getTargetById(existing.targetId);
                if (!target) {
                    delete this._pinchDrags[label];
                    continue;
                }
                // While the fingers are tight the sprite follows the pinch, even
                // if that has moved off the sprite. Once they start to open it
                // stops following, so it doesn't drift as they spread on the way
                // to a release, but keeps its grab in case they close again.
                //
                // The grip it was grabbed at is never revised. Re-measuring it
                // against a frozen sprite would fold every bit of hand movement
                // during the open frames into the grip, leaving the sprite
                // trailing further and further behind the fingers holding it.
                if (this._isHandTightlyPinching(hand)) {
                    target.setXY(
                        pinchPoint.x + (existing.gripX * scale),
                        pinchPoint.y + (existing.gripY * scale),
                        true
                    );
                }
            } else {
                // Try to grab a sprite under the pinch point.
                const target = this._pickTopSpriteAt(pinchPoint.x, pinchPoint.y, grabbedIds);
                if (!target) continue;
                target.goToFront();
                target.startDrag();
                // Hold the sprite a fixed fraction of a hand away from the pinch
                // rather than a fixed number of pixels, so the grip travels with
                // the hand as it nears or leaves the camera. A pixel grip taken
                // up close would hold the sprite out at arm's length once the
                // hand drew back and shrank.
                this._pinchDrags[label] = {
                    targetId: target.id,
                    gripX: (target.x - pinchPoint.x) / scale,
                    gripY: (target.y - pinchPoint.y) / scale
                };
                grabbedIds.add(target.id);
            }
        }
    }

    /**
     * A scratch reporter for how far apart the thumb and index fingertips are,
     * from 0 (touching) to 100 (spread wide). Measured against the hand's own
     * size, so the same gesture reads the same for any hand at any distance
     * from the camera. Reports 0 when the hand is not detected.
     * @param {object} args - the block arguments
     * @returns {number} a whole number from 0 to 100
     */
    pinchDistance (args) {
        const ratio = getPinchRatio(this._selectHand(args.HAND));
        if (ratio < 0) return 0;
        const percent = MathUtil.scale(ratio, PINCH_DISTANCE_CLOSED_RATIO, PINCH_DISTANCE_OPEN_RATIO, 0, 100);
        return Math.round(MathUtil.clamp(percent, 0, 100));
    }

    /**
     * A scratch command that points the sprite the way a finger is pointing,
     * measured from the joint nearest the tip (DIP, or IP for the thumb) toward the tip.
     * A finger held straight up points the sprite at 90°, the direction every sprite
     * starts at, so a sprite carried on a fingertip as a puppet keeps its usual facing
     * and turns as the finger bends.
     * @param {object} args - the block arguments
     * @param {BlockUtility} util - the block utility
     */
    pointInDirectionOfFinger (args, util) {
        const hand = this._selectHand(args.HAND);
        const indices = FINGER_NEAR_TIP[args.FINGER];
        if (!hand || !indices) return;
        const nearTip = hand.keypoints[indices[0]];
        const tip = hand.keypoints[indices[1]];
        if (!nearTip || !tip) return;
        util.target.setDirection(angleBetween(nearTip, tip));
    }
}

module.exports = Scratch3HandSensingBlocks;
