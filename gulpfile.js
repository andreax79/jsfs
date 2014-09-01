var gulp = require("gulp");
var typescript = require('gulp-tsc');
var browserify = require('gulp-browserify');
var rename = require('gulp-rename');
var del = require('del');

gulp.task('clean', function(cb) {
    del(['index.js', 'dist/index.js'], cb);
});

gulp.task('compile', function(){
    return gulp.src('index.ts')
            .pipe(typescript())
            .pipe(gulp.dest('.'));
});

gulp.task('browserify', ['compile'], function() {
    gulp.src('index.js')
        .pipe(browserify({
            insertGlobals : true,
            standalone: 'jsfs'
        }))
        .pipe(rename('jsfs.js'))
        .pipe(gulp.dest('./dist'));
});

gulp.task('default', ['browserify']);

