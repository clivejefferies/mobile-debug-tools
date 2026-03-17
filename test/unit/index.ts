// Unit test runner - imports tests organized by feature
(async () => {
  await import('./observe/wait_for_element_mock');
  await import('./observe/logstream.test');
  await import('./observe/logparse.test');
  await import('./manage/install.test');
  await import('./manage/build.test');
  await import('./manage/build_and_install.test');
  await import('./manage/diagnostics.test');
  await import('./utils/detect-java.test');

  console.log('Unit tests loaded. Run with: npx tsx test/unit/index.ts');
})();
