// Aggregator entrypoint for unit tests
import './utils/detect-java.test.ts'
import './observe/logparse.test.ts'
import './observe/logstream.test.ts'
import './observe/wait_for_element_mock.ts'
import './manage/install.test.ts'
import './manage/build.test.ts'
import './manage/build_and_install.test.ts'
import './manage/diagnostics.test.ts'
import './manage/detection.test.ts'
import './manage/mcp_disable_autodetect.test.ts'
import './observe/get_screen_fingerprint.test.ts'

console.log('Unit tests loaded.')
