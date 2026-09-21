// The app's language is one global setting, because every model and view model that
// computes a display string reaches Strings statically rather than being handed one.
// That is the right shape for the app and the wrong shape for parallel tests: the two
// tests that load the fake language change what every other test's English assertions
// see, and xUnit runs test classes in parallel by default.
//
// It surfaced as HostConnectionTests failing in a full run and passing on its own, which
// reads as a flake rather than as what it is. The whole suite is a few hundred
// milliseconds, so serialising it costs nothing worth measuring.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
